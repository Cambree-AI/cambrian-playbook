"""
Cambrian Catalyst - US Business Data Knowledge Layer Ingestor
==============================================================

Reads sources_manifest.json and pulls data from each free US business data source
into a normalized local knowledge base.

Usage:
    python ingest.py --list                        # list available sources
    python ingest.py --source fdic_institutions    # ingest one source
    python ingest.py --priority 1                  # ingest all priority-1 sources
    python ingest.py --verticals payments,banking  # ingest all sources tagged with these verticals
    python ingest.py --all                         # ingest everything (takes hours)

Output:
    ./data/<source_id>/raw/         -- untouched source records
    ./data/<source_id>/normalized/  -- mapped to the common company schema
    ./data/knowledge_layer.sqlite   -- unified queryable DB across all sources
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sqlite3
import sys
import time
import zipfile
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Iterator

import requests

HERE = Path(__file__).parent.resolve()
MANIFEST_PATH = HERE / "sources_manifest.json"
DATA_DIR = HERE / "data"
DB_PATH = DATA_DIR / "knowledge_layer.sqlite"

# Identify yourself to government APIs that require a UA string (SEC especially)
USER_AGENT = os.environ.get("KL_USER_AGENT", "Cambrian Catalyst GTM Research info@cambree.ai")
HEADERS = {"User-Agent": USER_AGENT, "Accept": "application/json, */*"}


# ---------------------------------------------------------------------------
# Normalized entity schema
# ---------------------------------------------------------------------------

@dataclass
class Company:
    """Normalized company record written to the unified knowledge layer."""
    source_id: str
    source_record_id: str
    name: str
    dba_names: list[str] = field(default_factory=list)
    identifiers: dict[str, str | None] = field(default_factory=dict)
    naics: list[str] = field(default_factory=list)
    sic: list[str] = field(default_factory=list)
    entity_type: str | None = None
    verticals: list[str] = field(default_factory=list)
    street: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    country: str = "US"
    website: str | None = None
    phone: str | None = None
    employees: int | None = None
    revenue_usd: float | None = None
    assets_usd: float | None = None
    founded_year: int | None = None
    status: str = "unknown"
    last_seen: str = ""
    confidence_score: float = 0.8
    raw: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------

def _init_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.executescript("""
    -- One row per (source, source record). The "long table" of everything ingested.
    CREATE TABLE IF NOT EXISTS companies (
        source_id TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        entity_id TEXT,              -- filled in by resolve.py, NULL until resolution runs
        name TEXT,
        entity_type TEXT,
        verticals TEXT,
        naics TEXT,
        identifiers TEXT,
        street TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        website TEXT,
        phone TEXT,
        employees INTEGER,
        revenue_usd REAL,
        assets_usd REAL,
        founded_year INTEGER,
        status TEXT,
        last_seen TEXT,
        raw TEXT,
        PRIMARY KEY (source_id, source_record_id)
    );
    CREATE INDEX IF NOT EXISTS idx_name ON companies(name);
    CREATE INDEX IF NOT EXISTS idx_state ON companies(state);
    CREATE INDEX IF NOT EXISTS idx_entity_type ON companies(entity_type);
    CREATE INDEX IF NOT EXISTS idx_verticals ON companies(verticals);
    CREATE INDEX IF NOT EXISTS idx_entity_id ON companies(entity_id);

    -- Time-series financial snapshots (bank call reports, 10-K data, etc.)
    -- One row per (source, entity key, period_end) with a JSON payload of metrics.
    CREATE TABLE IF NOT EXISTS financial_snapshots (
        source_id TEXT NOT NULL,
        source_record_id TEXT NOT NULL,
        period_end TEXT NOT NULL,
        metrics TEXT NOT NULL,       -- JSON: {ASSETS: ..., DEP: ..., NETINC: ..., ROE: ...}
        last_seen TEXT,
        PRIMARY KEY (source_id, source_record_id, period_end)
    );
    CREATE INDEX IF NOT EXISTS idx_snap_period ON financial_snapshots(period_end);

    -- Aggregate statistics (Census SUSB, CBP, BLS QCEW) - not entity-level.
    -- Dimensions stored as JSON so any source's grain can fit.
    CREATE TABLE IF NOT EXISTS aggregate_stats (
        source_id TEXT NOT NULL,
        stat_id TEXT NOT NULL,       -- e.g. "naics=522110;state=WA;empsize=05;year=2022"
        dimensions TEXT NOT NULL,    -- JSON of the dimension key/values
        metrics TEXT NOT NULL,       -- JSON of the measure values
        last_seen TEXT,
        PRIMARY KEY (source_id, stat_id)
    );

    -- Resolved entities - canonical records pointing to 1..n source rows.
    -- Populated by resolve.py.
    CREATE TABLE IF NOT EXISTS resolved_entities (
        entity_id TEXT PRIMARY KEY,
        canonical_name TEXT,
        entity_type TEXT,
        primary_state TEXT,
        primary_city TEXT,
        identifiers TEXT,            -- merged JSON of all known IDs
        vertical_tags TEXT,          -- union of verticals across source records
        source_count INTEGER,        -- how many sources confirm this entity
        confidence REAL,             -- resolution confidence
        first_seen TEXT,
        last_seen TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_re_name ON resolved_entities(canonical_name);
    CREATE INDEX IF NOT EXISTS idx_re_state ON resolved_entities(primary_state);
    """)
    return con


def write_companies(con: sqlite3.Connection, companies: Iterator[Company]) -> int:
    count = 0
    batch = []
    for c in companies:
        batch.append((
            c.source_id, c.source_record_id, None, c.name, c.entity_type,
            ",".join(c.verticals), ",".join(c.naics),
            json.dumps(c.identifiers), c.street, c.city, c.state, c.zip,
            c.website, c.phone, c.employees, c.revenue_usd, c.assets_usd,
            c.founded_year, c.status, c.last_seen, json.dumps(c.raw)
        ))
        if len(batch) >= 500:
            con.executemany(
                "INSERT OR REPLACE INTO companies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                batch
            )
            con.commit()
            count += len(batch)
            batch = []
    if batch:
        con.executemany(
            "INSERT OR REPLACE INTO companies VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            batch
        )
        con.commit()
        count += len(batch)
    return count


def write_snapshots(con: sqlite3.Connection, rows: Iterator[tuple]) -> int:
    """rows: iterator of (source_id, source_record_id, period_end, metrics_dict)"""
    now = datetime.utcnow().isoformat()
    count = 0
    batch = []
    for source_id, rec_id, period_end, metrics in rows:
        batch.append((source_id, rec_id, period_end, json.dumps(metrics), now))
        if len(batch) >= 500:
            con.executemany(
                "INSERT OR REPLACE INTO financial_snapshots VALUES (?,?,?,?,?)", batch
            )
            con.commit()
            count += len(batch)
            batch = []
    if batch:
        con.executemany(
            "INSERT OR REPLACE INTO financial_snapshots VALUES (?,?,?,?,?)", batch
        )
        con.commit()
        count += len(batch)
    return count


def write_aggregates(con: sqlite3.Connection, rows: Iterator[tuple]) -> int:
    """rows: iterator of (source_id, stat_id, dimensions_dict, metrics_dict)"""
    now = datetime.utcnow().isoformat()
    count = 0
    batch = []
    for source_id, stat_id, dims, metrics in rows:
        batch.append((source_id, stat_id, json.dumps(dims), json.dumps(metrics), now))
        if len(batch) >= 500:
            con.executemany(
                "INSERT OR REPLACE INTO aggregate_stats VALUES (?,?,?,?,?)", batch
            )
            con.commit()
            count += len(batch)
            batch = []
    if batch:
        con.executemany(
            "INSERT OR REPLACE INTO aggregate_stats VALUES (?,?,?,?,?)", batch
        )
        con.commit()
        count += len(batch)
    return count


def write_raw(source_id: str, records: list[dict]) -> Path:
    out = DATA_DIR / source_id / "raw" / f"{datetime.utcnow().strftime('%Y%m%d')}.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    return out


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def get(url: str, params: dict | None = None, retries: int = 3, sleep: float = 1.0) -> requests.Response:
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=60)
            if r.status_code == 429:  # rate limited
                time.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            time.sleep(sleep * (2 ** attempt))
    raise RuntimeError("unreachable")


# ---------------------------------------------------------------------------
# Source handlers
# ---------------------------------------------------------------------------
# Handlers come in three flavors:
#   @handler             -> yields Company records for the `companies` table
#   @snapshot_handler    -> yields (source_id, source_record_id, period_end, metrics_dict) tuples
#   @aggregate_handler   -> yields (source_id, stat_id, dimensions_dict, metrics_dict) tuples
# A source_id can register with multiple decorators (e.g. FDIC has both).

HANDLERS: dict[str, Callable[[dict], Iterator[Company]]] = {}
SNAPSHOT_HANDLERS: dict[str, Callable[[dict], Iterator[tuple]]] = {}
AGGREGATE_HANDLERS: dict[str, Callable[[dict], Iterator[tuple]]] = {}


def handler(source_id: str):
    def decorator(fn):
        HANDLERS[source_id] = fn
        return fn
    return decorator


def snapshot_handler(source_id: str):
    def decorator(fn):
        SNAPSHOT_HANDLERS[source_id] = fn
        return fn
    return decorator


def aggregate_handler(source_id: str):
    def decorator(fn):
        AGGREGATE_HANDLERS[source_id] = fn
        return fn
    return decorator


@handler("fdic_institutions")
def ingest_fdic_institutions(src: dict) -> Iterator[Company]:
    url = "https://banks.data.fdic.gov/api/institutions"
    fields = "NAME,CERT,RSSDID,ADDRESS,CITY,STALP,ZIP,WEBADDR,ASSET,DEP,NETINC,EMPNUM,ESTYMD,BKCLASS,ACTIVE"
    offset = 0
    limit = 10000
    now = datetime.utcnow().isoformat()
    while True:
        r = get(url, params={"limit": limit, "offset": offset, "fields": fields, "sort_by": "CERT"})
        rows = r.json().get("data", [])
        if not rows:
            break
        for row in rows:
            d = row.get("data", row)
            yield Company(
                source_id=src["id"],
                source_record_id=str(d.get("CERT")),
                name=d.get("NAME", ""),
                identifiers={"fdic_cert": str(d.get("CERT")), "rssd_id": str(d.get("RSSDID") or "")},
                entity_type="bank",
                verticals=src.get("verticals", []),
                street=d.get("ADDRESS"),
                city=d.get("CITY"),
                state=d.get("STALP"),
                zip=str(d.get("ZIP") or ""),
                website=d.get("WEBADDR"),
                employees=int(d["EMPNUM"]) if d.get("EMPNUM") else None,
                assets_usd=float(d["ASSET"]) * 1000 if d.get("ASSET") else None,
                founded_year=int(str(d.get("ESTYMD"))[:4]) if d.get("ESTYMD") else None,
                status="active" if d.get("ACTIVE") == 1 else "inactive",
                last_seen=now,
                confidence_score=0.95,
                raw=d,
            )
        offset += limit
        if len(rows) < limit:
            break
        time.sleep(0.2)


@handler("ncua_call_report")
def ingest_ncua_call_report(src: dict) -> Iterator[Company]:
    """
    NCUA ships quarterly zipped CSVs. We pull the most recent FOICU.txt
    (credit union profile file) which contains one row per credit union.
    See https://www.ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data
    """
    # NCUA doesn't expose a single static URL - you typically browse for the latest quarter.
    # Set NCUA_QUARTER_URL env var to a known-good zip or update this handler.
    url = os.environ.get("NCUA_QUARTER_URL")
    if not url:
        print("  skip: set NCUA_QUARTER_URL to the latest quarterly zip download URL", file=sys.stderr)
        return
    r = get(url)
    now = datetime.utcnow().isoformat()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        foicu_name = next((n for n in z.namelist() if n.upper().startswith("FOICU")), None)
        if not foicu_name:
            print("  warn: FOICU.txt not found in zip", file=sys.stderr)
            return
        with z.open(foicu_name) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"))
            for row in reader:
                yield Company(
                    source_id=src["id"],
                    source_record_id=row.get("CU_NUMBER", ""),
                    name=row.get("CU_NAME", ""),
                    identifiers={"ncua_charter": row.get("CU_NUMBER", "")},
                    entity_type="credit_union",
                    verticals=src.get("verticals", []),
                    street=row.get("STREET"),
                    city=row.get("CITY"),
                    state=row.get("STATE"),
                    zip=row.get("ZIP_CODE"),
                    website=row.get("SITE_WEB"),
                    phone=row.get("PHONE"),
                    status="active",
                    last_seen=now,
                    confidence_score=0.95,
                    raw=row,
                )


@handler("sec_company_tickers")
def ingest_sec_tickers(src: dict) -> Iterator[Company]:
    url = "https://www.sec.gov/files/company_tickers_exchange.json"
    r = get(url)
    data = r.json()
    # Newer format: {"fields": [...], "data": [[...], [...]]}
    fields = data.get("fields", [])
    now = datetime.utcnow().isoformat()
    for row in data.get("data", []):
        rec = dict(zip(fields, row))
        cik = str(rec.get("cik", "")).zfill(10)
        yield Company(
            source_id=src["id"],
            source_record_id=cik,
            name=rec.get("name", ""),
            identifiers={"cik": cik, "ticker": rec.get("ticker")},
            entity_type="public_company",
            verticals=src.get("verticals", []),
            status="active",
            last_seen=now,
            confidence_score=0.99,
            raw=rec,
        )


@handler("fincen_msb")
def ingest_fincen_msb(src: dict) -> Iterator[Company]:
    """
    FinCEN publishes the MSB registrant list as a per-state CSV and a national rollup.
    As of this writing the canonical URL is:
      https://www.fincen.gov/sites/default/files/shared/mls.txt  (national, pipe-delimited)
    This URL sometimes moves; set FINCEN_MSB_URL to override.
    """
    url = os.environ.get(
        "FINCEN_MSB_URL",
        "https://www.fincen.gov/sites/default/files/shared/mls.txt"
    )
    r = get(url)
    now = datetime.utcnow().isoformat()
    # File is pipe-delimited with a header row
    reader = csv.DictReader(io.StringIO(r.text), delimiter="|")
    for row in reader:
        yield Company(
            source_id=src["id"],
            source_record_id=row.get("RSSD_ID") or row.get("MSB_ID") or row.get("LEGAL_NAME", ""),
            name=row.get("LEGAL_NAME", ""),
            dba_names=[row["DBA_NAME"]] if row.get("DBA_NAME") else [],
            identifiers={"fincen_msb": row.get("RSSD_ID") or row.get("MSB_ID")},
            entity_type="money_services_business",
            verticals=src.get("verticals", []),
            street=row.get("STREET_1"),
            city=row.get("CITY"),
            state=row.get("STATE"),
            zip=row.get("ZIP"),
            status="active",
            last_seen=now,
            confidence_score=0.9,
            raw=row,
        )


@handler("sba_ppp")
def ingest_sba_ppp(src: dict) -> Iterator[Company]:
    """
    The SBA PPP dataset is large (~11M rows) and split across multiple CSVs.
    This handler expects you to have downloaded the files locally already from
    https://data.sba.gov/dataset/ppp-foia and points to a directory via env var.
    """
    ppp_dir = os.environ.get("PPP_DATA_DIR")
    if not ppp_dir or not Path(ppp_dir).exists():
        print("  skip: set PPP_DATA_DIR to a directory containing PPP FOIA CSVs", file=sys.stderr)
        return
    now = datetime.utcnow().isoformat()
    for csv_path in Path(ppp_dir).glob("*.csv"):
        with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                yield Company(
                    source_id=src["id"],
                    source_record_id=row.get("LoanNumber", ""),
                    name=row.get("BorrowerName", ""),
                    identifiers={},
                    naics=[row["NAICSCode"]] if row.get("NAICSCode") else [],
                    entity_type=row.get("BusinessType", "company").lower().replace(" ", "_"),
                    verticals=["smb_broad"],
                    street=row.get("BorrowerAddress"),
                    city=row.get("BorrowerCity"),
                    state=row.get("BorrowerState"),
                    zip=row.get("BorrowerZip"),
                    employees=int(row["JobsReported"]) if row.get("JobsReported", "").isdigit() else None,
                    status="unknown",
                    last_seen=now,
                    confidence_score=0.6,  # historical snapshot, many closed since
                    raw=row,
                )


@handler("cms_npi")
def ingest_cms_npi(src: dict) -> Iterator[Company]:
    """
    CMS NPI bulk file is ~8GB zipped. Download from https://download.cms.gov/nppes/NPI_Files.html
    and point NPI_CSV_PATH at the unzipped npidata_pfile_*.csv
    """
    path = os.environ.get("NPI_CSV_PATH")
    if not path:
        print("  skip: set NPI_CSV_PATH to unzipped NPPES npidata file", file=sys.stderr)
        return
    now = datetime.utcnow().isoformat()
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Only ingest organizational providers (Entity Type Code 2); individuals are noisy
            if row.get("Entity Type Code") != "2":
                continue
            yield Company(
                source_id=src["id"],
                source_record_id=row.get("NPI", ""),
                name=row.get("Provider Organization Name (Legal Business Name)", ""),
                identifiers={"npi": row.get("NPI"), "ein": row.get("Employer Identification Number (EIN)")},
                entity_type="healthcare_org",
                verticals=src.get("verticals", []),
                street=row.get("Provider First Line Business Practice Location Address"),
                city=row.get("Provider Business Practice Location Address City Name"),
                state=row.get("Provider Business Practice Location Address State Name"),
                zip=row.get("Provider Business Practice Location Address Postal Code"),
                phone=row.get("Provider Business Practice Location Address Telephone Number"),
                status="active" if row.get("NPI Deactivation Date") in (None, "") else "inactive",
                last_seen=now,
                confidence_score=0.9,
                raw={k: row.get(k) for k in list(row.keys())[:20]},  # truncate raw for size
            )


@handler("irs_eo_bmf")
def ingest_irs_eo_bmf(src: dict) -> Iterator[Company]:
    """Pulls the national rollup of IRS Exempt Organizations BMF."""
    # IRS publishes 4 regional files + 1 international; URLs rotate monthly.
    # Override via env var for the current month.
    urls = os.environ.get(
        "IRS_BMF_URLS",
        "https://www.irs.gov/pub/irs-soi/eo1.csv,https://www.irs.gov/pub/irs-soi/eo2.csv,"
        "https://www.irs.gov/pub/irs-soi/eo3.csv,https://www.irs.gov/pub/irs-soi/eo4.csv"
    ).split(",")
    now = datetime.utcnow().isoformat()
    for url in urls:
        try:
            r = get(url.strip())
        except Exception as e:
            print(f"  skip {url}: {e}", file=sys.stderr)
            continue
        reader = csv.DictReader(io.StringIO(r.text))
        for row in reader:
            yield Company(
                source_id=src["id"],
                source_record_id=row.get("EIN", ""),
                name=row.get("NAME", ""),
                identifiers={"ein": row.get("EIN")},
                entity_type="nonprofit",
                verticals=["nonprofit"],
                street=row.get("STREET"),
                city=row.get("CITY"),
                state=row.get("STATE"),
                zip=row.get("ZIP"),
                status="active",
                last_seen=now,
                confidence_score=0.85,
                raw=row,
            )


@handler("dol_form5500")
def ingest_dol_form5500(src: dict) -> Iterator[Company]:
    """
    Form 5500 datasets are zipped per year. Point FORM5500_CSV_PATH at a
    downloaded f_5500_{year}_latest.csv from
    https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/public-disclosure/foia/form-5500-datasets
    """
    path = os.environ.get("FORM5500_CSV_PATH")
    if not path:
        print("  skip: set FORM5500_CSV_PATH to a downloaded Form 5500 csv", file=sys.stderr)
        return
    now = datetime.utcnow().isoformat()
    seen_eins: set[str] = set()  # dedupe: we only want sponsor per run
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ein = row.get("SPONS_DFE_EIN", "")
            if not ein or ein in seen_eins:
                continue
            seen_eins.add(ein)
            participants = row.get("TOT_PARTCP_BOY_CNT", "")
            yield Company(
                source_id=src["id"],
                source_record_id=ein,
                name=row.get("SPONSOR_DFE_NAME", ""),
                identifiers={"ein": ein},
                entity_type="employer",
                verticals=["health_wellness_b2b", "mid_market", "enterprise"],
                street=row.get("SPONS_DFE_MAIL_US_ADDRESS1"),
                city=row.get("SPONS_DFE_MAIL_US_CITY"),
                state=row.get("SPONS_DFE_MAIL_US_STATE"),
                zip=row.get("SPONS_DFE_MAIL_US_ZIP"),
                phone=row.get("ADMIN_PHONE_NUM"),
                employees=int(participants) if participants.isdigit() else None,
                status="active",
                last_seen=now,
                confidence_score=0.8,
                raw=row,
            )


@handler("cfpb_complaints")
def ingest_cfpb_complaints(src: dict) -> Iterator[Company]:
    """
    CFPB is a complaint-level dataset, not a company registry. We aggregate
    complaints per company and write one Company record per unique firm with
    complaint counts in the raw field for downstream signal scoring.
    """
    url = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"
    now = datetime.utcnow().isoformat()
    # Use aggregation endpoint to get counts
    r = get(url, params={"size": 0, "aggs": "company", "field": "company", "no_aggs": "false"})
    # Response format: hits.aggregations.company.buckets -> [{key, doc_count}, ...]
    # This is a simplified pull; production should page through the full aggregation.
    data = r.json()
    buckets = (
        data.get("hits", {}).get("aggregations", {}).get("company", {}).get("buckets", [])
        or data.get("aggregations", {}).get("company", {}).get("buckets", [])
    )
    for b in buckets:
        company_name = b.get("key", "")
        yield Company(
            source_id=src["id"],
            source_record_id=company_name,
            name=company_name,
            identifiers={},
            entity_type="financial_services",
            verticals=src.get("verticals", []),
            status="active",
            last_seen=now,
            confidence_score=0.5,
            raw={"complaint_count": b.get("doc_count")},
        )


@handler("fdic_locations")
def ingest_fdic_locations(src: dict) -> Iterator[Company]:
    """Every FDIC-insured bank branch. ~85K records. Useful for geo targeting."""
    url = "https://banks.data.fdic.gov/api/locations"
    fields = "UNINUMBR,CERT,RSSDID,NAMEFULL,ADDRESS,CITY,STALP,ZIP,SERVTYPE,DEPSUMBR,ESTYMD"
    offset = 0
    limit = 10000
    now = datetime.utcnow().isoformat()
    while True:
        r = get(url, params={"limit": limit, "offset": offset, "fields": fields})
        rows = r.json().get("data", [])
        if not rows:
            break
        for row in rows:
            d = row.get("data", row)
            yield Company(
                source_id=src["id"],
                source_record_id=str(d.get("UNINUMBR")),
                name=d.get("NAMEFULL", ""),
                identifiers={
                    "fdic_cert": str(d.get("CERT")),
                    "rssd_id": str(d.get("RSSDID") or ""),
                    "fdic_uninumbr": str(d.get("UNINUMBR")),
                },
                entity_type="bank_branch",
                verticals=src.get("verticals", []),
                street=d.get("ADDRESS"),
                city=d.get("CITY"),
                state=d.get("STALP"),
                zip=str(d.get("ZIP") or ""),
                founded_year=int(str(d.get("ESTYMD"))[:4]) if d.get("ESTYMD") else None,
                status="active",
                last_seen=now,
                confidence_score=0.95,
                raw=d,
            )
        offset += limit
        if len(rows) < limit:
            break
        time.sleep(0.2)


@snapshot_handler("fdic_financial")
def ingest_fdic_financial(src: dict) -> Iterator[tuple]:
    """
    Quarterly call report data. 1,100+ fields per bank; we pull a curated set
    of the most useful GTM-relevant metrics and drop them into financial_snapshots.
    """
    url = "https://banks.data.fdic.gov/api/financials"
    # Curated field set - balance sheet, income, asset quality, and tech/trust spend proxies
    metric_fields = [
        "ASSET", "DEP", "DEPDOM", "LNLSNET", "LNLSGR", "LNRE", "LNCI",
        "NETINC", "NIMY", "EQ", "ROA", "ROE",
        "NPERFV", "NTLNLS",               # non-performing, charge-offs (pain signals)
        "EINTEXP", "ENONINT", "ETOTNINT", # expense detail — high data-processing spend correlates with tech modernization
        "SC", "NUMEMP", "OFFDOM",         # services charges, employees, domestic offices
    ]
    fields = "CERT,RSSDID,REPDTE," + ",".join(metric_fields)
    # Default: most recent quarter end. User can override with FDIC_PERIOD env var as YYYYMMDD.
    period = os.environ.get("FDIC_PERIOD")
    filters = f"REPDTE:{period}" if period else None
    offset = 0
    limit = 10000
    while True:
        params = {"limit": limit, "offset": offset, "fields": fields, "sort_by": "CERT"}
        if filters:
            params["filters"] = filters
        r = get(url, params=params)
        rows = r.json().get("data", [])
        if not rows:
            break
        for row in rows:
            d = row.get("data", row)
            cert = str(d.get("CERT"))
            period_end = str(d.get("REPDTE", ""))
            if not cert or not period_end:
                continue
            metrics = {k: d.get(k) for k in metric_fields if d.get(k) is not None}
            # Link snapshot back to the institution record by reusing fdic_institutions' ID
            yield ("fdic_institutions", cert, period_end, metrics)
        offset += limit
        if len(rows) < limit:
            break
        time.sleep(0.2)


@handler("sam_entities")
def ingest_sam_entities(src: dict) -> Iterator[Company]:
    """
    SAM.gov entity registration API. Requires a free API key from sam.gov.
    Set SAM_API_KEY env var. ~700K active federal contractor registrations.
    """
    api_key = os.environ.get("SAM_API_KEY")
    if not api_key:
        print("  skip: set SAM_API_KEY (register free at api.sam.gov)", file=sys.stderr)
        return
    url = "https://api.sam.gov/entity-information/v3/entities"
    now = datetime.utcnow().isoformat()
    page = 0
    size = 100  # SAM's max per page
    # Filter to US + active registrations; override via env if you need more
    filter_q = os.environ.get("SAM_FILTER", "registrationStatus=A&purposeOfRegistrationCode=Z2")
    while True:
        params = {
            "api_key": api_key,
            "page": page,
            "size": size,
            # Example extra filters can be appended via the &filter_q env
        }
        r = get(f"{url}?{filter_q}", params=params)
        data = r.json()
        entities = data.get("entityData", [])
        if not entities:
            break
        for e in entities:
            core = e.get("entityRegistration", {})
            core_data = e.get("coreData", {})
            physical = core_data.get("physicalAddress", {}) if core_data else {}
            yield Company(
                source_id=src["id"],
                source_record_id=core.get("ueiSAM", ""),
                name=core.get("legalBusinessName", ""),
                dba_names=[core.get("dbaName")] if core.get("dbaName") else [],
                identifiers={
                    "uei_sam": core.get("ueiSAM"),
                    "cage_code": core.get("cageCode"),
                    "duns": core.get("ueiDUNS"),
                },
                entity_type="government_contractor",
                verticals=src.get("verticals", []),
                street=physical.get("addressLine1"),
                city=physical.get("city"),
                state=physical.get("stateOrProvinceCode"),
                zip=physical.get("zipCode"),
                status="active" if core.get("registrationStatus") == "Active" else "inactive",
                last_seen=now,
                confidence_score=0.95,
                raw={"registration": core, "core_data": core_data},
            )
        page += 1
        if page * size >= data.get("totalRecords", 0):
            break
        time.sleep(0.3)


@aggregate_handler("census_susb")
def ingest_census_susb(src: dict) -> Iterator[tuple]:
    """
    Census Statistics of US Businesses - aggregate firm counts by NAICS/state/size.
    This is TAM-sizing data, not firm-level. Goes into aggregate_stats table.

    Set CENSUS_API_KEY (free at https://api.census.gov/data/key_signup.html)
    and optionally CENSUS_SUSB_YEAR (default 2021).
    """
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        print("  skip: set CENSUS_API_KEY (free at api.census.gov)", file=sys.stderr)
        return
    year = os.environ.get("CENSUS_SUSB_YEAR", "2021")
    # Variables: firm count, establishment count, employment, payroll, by NAICS+state+employee-size
    url = f"https://api.census.gov/data/{year}/susb"
    params = {
        "get": "NAME,FIRM,ESTAB,EMP,PAYANN,NAICS2017_LABEL,ENTRSIZE_LABEL",
        "for": "state:*",
        "NAICS2017": "*",
        "ENTRSIZE": "*",
        "key": key,
    }
    r = get(url, params=params)
    data = r.json()
    if not data or len(data) < 2:
        return
    header, rows = data[0], data[1:]
    for row in rows:
        rec = dict(zip(header, row))
        stat_id = f"y={year};naics={rec.get('NAICS2017')};state={rec.get('state')};size={rec.get('ENTRSIZE')}"
        dims = {
            "year": year,
            "naics": rec.get("NAICS2017"),
            "naics_label": rec.get("NAICS2017_LABEL"),
            "state_fips": rec.get("state"),
            "entsize_code": rec.get("ENTRSIZE"),
            "entsize_label": rec.get("ENTRSIZE_LABEL"),
        }
        metrics = {
            "firm_count": int(rec["FIRM"]) if rec.get("FIRM", "").lstrip("-").isdigit() else None,
            "establishment_count": int(rec["ESTAB"]) if rec.get("ESTAB", "").lstrip("-").isdigit() else None,
            "employment": int(rec["EMP"]) if rec.get("EMP", "").lstrip("-").isdigit() else None,
            "annual_payroll_1000s": int(rec["PAYANN"]) if rec.get("PAYANN", "").lstrip("-").isdigit() else None,
        }
        yield (src["id"], stat_id, dims, metrics)


@handler("gleif_lei")
def ingest_gleif_lei(src: dict) -> Iterator[Company]:
    """
    GLEIF LEI via API, filtered to US entities. Full concatenated file is ~700MB;
    API approach is far more tractable. Pulls all US records in batches.
    """
    url = "https://api.gleif.org/api/v1/lei-records"
    now = datetime.utcnow().isoformat()
    page = 1
    size = 200  # GLEIF max
    while True:
        params = {
            "filter[entity.legalAddress.country]": "US",
            "filter[entity.status]": "ACTIVE",
            "page[size]": size,
            "page[number]": page,
        }
        r = get(url, params=params)
        data = r.json()
        records = data.get("data", [])
        if not records:
            break
        for rec in records:
            attrs = rec.get("attributes", {})
            entity = attrs.get("entity", {})
            legal_address = entity.get("legalAddress", {})
            yield Company(
                source_id=src["id"],
                source_record_id=attrs.get("lei", ""),
                name=entity.get("legalName", {}).get("name", ""),
                identifiers={"lei": attrs.get("lei")},
                entity_type="legal_entity",
                verticals=src.get("verticals", []),
                street=", ".join(legal_address.get("addressLines") or []) or None,
                city=legal_address.get("city"),
                state=legal_address.get("region", "").split("-")[-1] if legal_address.get("region") else None,
                zip=legal_address.get("postalCode"),
                status="active",
                last_seen=now,
                confidence_score=0.9,
                raw=attrs,
            )
        meta = data.get("meta", {}).get("pagination", {})
        if page >= meta.get("lastPage", page):
            break
        page += 1
        time.sleep(0.3)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def load_manifest() -> dict:
    with open(MANIFEST_PATH) as f:
        return json.load(f)


def list_sources(manifest: dict) -> None:
    print(f"\n{len(manifest['sources'])} sources in manifest:\n")
    print(f"{'ID':<28} {'Priority':<10} {'Handlers':<18} {'Verticals'}")
    print("-" * 100)
    for s in sorted(manifest["sources"], key=lambda x: (x.get("priority", 99), x["id"])):
        sid = s["id"]
        marks = []
        if sid in HANDLERS: marks.append("company")
        if sid in SNAPSHOT_HANDLERS: marks.append("snapshot")
        if sid in AGGREGATE_HANDLERS: marks.append("aggregate")
        handler_str = ",".join(marks) if marks else "—"
        print(f"{sid:<28} {s.get('priority', '?'):<10} {handler_str:<18} {','.join(s.get('verticals', []))}")
    print(f"\ncompany/snapshot/aggregate = which tables this source writes to")
    print(f"— = source documented in manifest but no handler implemented yet\n")


def ingest_source(src: dict, con: sqlite3.Connection) -> dict:
    sid = src["id"]
    if sid not in HANDLERS and sid not in SNAPSHOT_HANDLERS and sid not in AGGREGATE_HANDLERS:
        print(f"[{sid}] no handler implemented - skipping")
        return {"companies": 0, "snapshots": 0, "aggregates": 0}
    print(f"[{sid}] fetching ...")
    result = {"companies": 0, "snapshots": 0, "aggregates": 0}
    t0 = time.time()
    try:
        if sid in HANDLERS:
            result["companies"] = write_companies(con, HANDLERS[sid](src))
        if sid in SNAPSHOT_HANDLERS:
            result["snapshots"] = write_snapshots(con, SNAPSHOT_HANDLERS[sid](src))
        if sid in AGGREGATE_HANDLERS:
            result["aggregates"] = write_aggregates(con, AGGREGATE_HANDLERS[sid](src))
        total = sum(result.values())
        print(f"[{sid}] wrote {total} records ({result}) in {time.time()-t0:.1f}s")
    except Exception as e:
        print(f"[{sid}] ERROR: {e}", file=sys.stderr)
    return result


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--list", action="store_true", help="list sources and exit")
    p.add_argument("--source", help="ingest one source by id")
    p.add_argument("--priority", type=int, help="ingest all sources at this priority or higher")
    p.add_argument("--verticals", help="comma-separated list of verticals to include")
    p.add_argument("--all", action="store_true", help="ingest everything that has a handler")
    args = p.parse_args()

    manifest = load_manifest()

    if args.list:
        list_sources(manifest)
        return

    DATA_DIR.mkdir(exist_ok=True)
    con = _init_db(DB_PATH)

    selected = []
    if args.source:
        selected = [s for s in manifest["sources"] if s["id"] == args.source]
        if not selected:
            print(f"No source with id={args.source}", file=sys.stderr)
            sys.exit(1)
    elif args.priority is not None:
        selected = [s for s in manifest["sources"] if s.get("priority", 99) <= args.priority]
    elif args.verticals:
        targets = set(args.verticals.split(","))
        selected = [s for s in manifest["sources"] if set(s.get("verticals", [])) & targets]
    elif args.all:
        selected = manifest["sources"]
    else:
        p.print_help()
        return

    totals = {"companies": 0, "snapshots": 0, "aggregates": 0}
    for src in selected:
        r = ingest_source(src, con)
        for k in totals:
            totals[k] += r.get(k, 0)

    print(f"\nDone.")
    print(f"  companies written:  {totals['companies']:,}")
    print(f"  snapshots written:  {totals['snapshots']:,}")
    print(f"  aggregates written: {totals['aggregates']:,}")
    print(f"  DB: {DB_PATH}")
    print(f"\nNext: run `python resolve.py` to build the cross-source entity resolution graph.")


if __name__ == "__main__":
    main()
