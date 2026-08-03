// stages/S9_SolutionFit.jsx — Solution Architecture review (now Step 8)
// Presentational component. buildSolutionFit() stays in App.jsx to keep
// state access simple; this just renders and routes callback intent.

const friendlyStage = {
  Define: "Early Discovery — knows the problem exists",
  Measure: "Quantifying — starting to measure the gap",
  Analyze: "Root Cause — understands why it's broken",
  Improve: "Solution Ready — actively evaluating fixes",
  Control: "Optimizing — has a process, seeking better",
};

export default function S9SolutionFit({
  solutionFit,
  solutionFitLoading,
  selectedAccount,
  onRun,           // click "Run Solution Fit Review"
  onRegenerate,    // click "↻ Regenerate"
  onBack,          // "← Live Call"
  onExport,        // "🖨 Save as PDF"
  onDownloadData,  // "💾 Data" — JSON download (legacy)
  onCSV,           // "📊 CSV" — CSV export
  onNext,          // "Route Deal →" — fires runPostCall + advances
  onNextAccount,   // "Next Account"
  embedded,        // true = skip outer <div className="page">, title/sub, and action bar
                   //   (Step 6 merged stage owns the wrapper; parent provides the action bar)
}) {
  const inner = (
    <>
      {!embedded && (
        <><div className="page-title">Solution Architecture Review</div>
        <div className="page-sub">Solution fit evaluation for <strong>{selectedAccount?.company}</strong> — aligned to what you actually heard, not just what you assumed.</div></>
      )}

      {solutionFitLoading && (
        <div className="card">
          <div style={{fontSize:13,color:"var(--ink-2)",marginBottom:12}}>Applying the Solution Architecture framework...</div>
          <div className="pulse-wrap">{[70,90,55,80,65,75,50].map((w,i)=><div key={i} className="pulse-line" style={{width:w+"%",animationDelay:(i*0.12)+"s"}}/>)}</div>
          <div style={{fontSize:12,color:"var(--tan-0)",marginTop:12,fontStyle:"italic"}}>
            Evaluating business alignment, integration complexity, and implementation phasing...
          </div>
        </div>
      )}

      {solutionFit && !solutionFitLoading && (
        <>
          {/* PMF Assessment */}
          {solutionFit.pmfAssessment && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10,marginBottom:20}}>
              {[
                {label:"Target Customer Fit",val:solutionFit.pmfAssessment.targetCustomerFit},
                {label:"Underserved Need",val:solutionFit.pmfAssessment.underservedNeedFit},
                {label:"Value Prop Fit",val:solutionFit.pmfAssessment.valuePropositionFit},
                {label:"Overall PMF Signal",val:solutionFit.pmfAssessment.overallPMFSignal},
              ].filter(x=>x.val).map((x,i)=>{
                const isStrong=x.val?.toLowerCase().includes("strong");
                const isWeak=x.val?.toLowerCase().includes("weak");
                const c=isStrong?"var(--green)":isWeak?"var(--red)":"var(--amber)";
                const bg=isStrong?"var(--green-bg)":isWeak?"var(--red-bg)":"var(--amber-bg)";
                return(
                  <div key={i} style={{background:bg,border:"1px solid "+c+"44",borderRadius:10,padding:"10px 12px"}}>
                    <div style={{fontSize:10,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:4}}>{x.label}</div>
                    <div style={{fontSize:13,fontWeight:700,color:c}}>{x.val}</div>
                  </div>
                );
              })}
            </div>
          )}

          {solutionFit.adoptionProfile && (
            <div style={{background:"var(--navy-bg)",border:"1px solid var(--navy)",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--navy)",textTransform:"uppercase",letterSpacing:"0.4px"}}>Buyer Readiness</div>
                <span style={{background:"var(--navy)",color:"var(--surface)",borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:700}}>{solutionFit.adoptionProfile}</span>
              </div>
              {solutionFit.adoptionImplication && <div style={{fontSize:13,color:"var(--ink-1)",lineHeight:1.6}}>{solutionFit.adoptionImplication}</div>}
            </div>
          )}

          {solutionFit.dmiacStage && (
            <div style={{background:"var(--bg-2)",border:"1px solid var(--line-0)",borderRadius:14,padding:"16px 20px",marginBottom:20}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{fontFamily:"Lora,serif",fontSize:15,fontWeight:600,color:"var(--ink-0)"}}>Operational Maturity:</div>
                {(()=>{
                  const map={Define:"var(--red)",Measure:"var(--amber)",Analyze:"var(--navy)",Improve:"var(--green)",Control:"var(--purple)"};
                  const bgmap={Define:"var(--red-bg)",Measure:"var(--amber-bg)",Analyze:"var(--navy-bg)",Improve:"var(--green-bg)",Control:"var(--purple-bg)"};
                  const c=map[solutionFit.dmiacStage]||"var(--ink-2)";
                  const bg=bgmap[solutionFit.dmiacStage]||"var(--bg-2)";
                  return<span style={{background:bg,color:c,border:"1.5px solid "+c+"44",borderRadius:20,padding:"4px 16px",fontSize:14,fontWeight:700}}>{solutionFit.dmiacStage}</span>;
                })()}
              </div>
              {friendlyStage[solutionFit.dmiacStage] && <div style={{fontSize:13,color:"var(--ink-2)",marginBottom:6,fontStyle:"italic"}}>{friendlyStage[solutionFit.dmiacStage]}</div>}
              {solutionFit.dmiacRationale && <div style={{fontSize:14,color:"var(--ink-2)",lineHeight:1.6,marginBottom:solutionFit.entryStrategy?10:0}}>{solutionFit.dmiacRationale}</div>}
              {solutionFit.entryStrategy && (
                <div style={{background:"var(--ink-0)",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--tan-0)",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:4}}>Recommended Entry Strategy</div>
                  <div style={{fontSize:13,color:"var(--surface)",lineHeight:1.6}}>{solutionFit.entryStrategy}</div>
                </div>
              )}
            </div>
          )}

          {/* Integration complexity badge */}
          <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
            <div style={{fontFamily:"Lora,serif",fontSize:16,fontWeight:600,color:"var(--ink-0)"}}>
              Integration Complexity:
            </div>
            {(()=>{
              const ic=(solutionFit.integrationComplexity||"").split("/")[0].trim().toLowerCase();
              const c=ic==="low"?"var(--green)":ic==="medium"?"var(--amber)":"var(--red)";
              const bg=ic==="low"?"var(--green-bg)":ic==="medium"?"var(--amber-bg)":"var(--red-bg)";
              return<span style={{background:bg,color:c,border:"1px solid "+c+"44",borderRadius:20,padding:"4px 14px",fontSize:14,fontWeight:700}}>
                {solutionFit.integrationComplexity}
              </span>;
            })()}
          </div>

          {/* Confirmed Solutions */}
          {(solutionFit.confirmedSolutions||[]).length>0 && (
            <div className="bb">
              <div className="bb-hdr">
                <div className="bb-icon">{solutionFit._preCall ? "🎯" : "✓"}</div>
                <div><div className="bb-title">{solutionFit._preCall ? "Recommended Solution Fit" : "Confirmed Solution Fit"}</div><div className="bb-sub">{solutionFit._preCall ? "Best-fit solutions to lead with — with SA rationale" : "Solutions validated by discovery — with SA rationale"}</div></div>
              </div>
              <div className="bb-body">
                {solutionFit.confirmedSolutions.map((s,i)=>(
                  <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:i<solutionFit.confirmedSolutions.length-1?"1px solid var(--line-1)":"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                      <div style={{background:"var(--line-1)",color:"var(--tan-ink)",border:"1px solid var(--tan-2)",fontFamily:"Lora,serif",fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:6,whiteSpace:"nowrap"}}>
                        {s.product}
                      </div>
                      <div style={{fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:20,
                        background:s.fitScore>=75?"var(--green-bg)":s.fitScore>=50?"var(--amber-bg)":"var(--red-bg)",
                        color:s.fitScore>=75?"var(--green)":s.fitScore>=50?"var(--amber)":"var(--red)",
                        border:"1px solid "+(s.fitScore>=75?"var(--green)":s.fitScore>=50?"var(--amber)":"var(--red)")+"44"}}>
                        {s.fitScore}% · {s.fitLabel}
                      </div>
                      <div style={{fontSize:11,background:"var(--bg-2)",border:"1px solid var(--line-0)",borderRadius:10,padding:"2px 10px",color:"var(--ink-2)"}}>
                        {s.implementationPhase}
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12}}>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--tan-0)",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:4}}>Business Alignment</div>
                        <div style={{fontSize:13,color:"var(--ink-1)",lineHeight:1.6}}>{s.businessAlignment}</div>
                      </div>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--navy)",textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:4}}>Architecture Notes</div>
                        <div style={{fontSize:13,color:"var(--ink-1)",lineHeight:1.6}}>{s.architectureNotes}</div>
                      </div>
                    </div>
                    {s.risks && (
                      <div style={{marginTop:8,padding:"8px 10px",background:"var(--red-bg)",borderRadius:6,fontSize:12,color:"var(--red)"}}>
                        ⚠ {s.risks}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revised / Changed Solutions */}
          {(solutionFit.revisedSolutions||[]).length>0 && (
            <div className="bb">
              <div className="bb-hdr">
                <div className="bb-icon" style={{fontSize:14}}>↕</div>
                <div><div className="bb-title">{solutionFit._preCall ? "Lower-Fit — Reconsider" : "Revised After Discovery"}</div><div className="bb-sub">{solutionFit._preCall ? "Solutions less likely to land, based on current signals" : "Solutions that changed based on what you actually heard"}</div></div>
              </div>
              <div className="bb-body">
                {solutionFit.revisedSolutions.map((r,i)=>(
                  <div key={i} style={{display:"flex",gap:10,padding:"10px 12px",background:"var(--bg-1)",borderRadius:8,marginBottom:8,border:"1px solid var(--line-0)"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                        <span style={{fontWeight:700,fontSize:13,color:"var(--ink-0)"}}>{r.product}</span>
                        <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,
                          background:r.change==="Upgraded"?"var(--green-bg)":r.change==="Removed"?"var(--red-bg)":"var(--amber-bg)",
                          color:r.change==="Upgraded"?"var(--green)":r.change==="Removed"?"var(--red)":"var(--amber)"}}>
                          {r.change}
                        </span>
                      </div>
                      <div style={{fontSize:13,color:"var(--ink-2)",lineHeight:1.5}}>{r.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Architecture Gaps */}
          {(solutionFit.architectureGaps||[]).length>0 && (
            <div className="bb">
              <div className="bb-hdr">
                <div className="bb-icon" style={{fontSize:14}}>🔍</div>
                <div><div className="bb-title">Architecture Gaps</div><div className="bb-sub">Customer needs not fully addressed — recommendations to bridge</div></div>
              </div>
              <div className="bb-body">
                {solutionFit.architectureGaps.map((g,i)=>(
                  <div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:i<solutionFit.architectureGaps.length-1?"1px solid var(--line-1)":"none"}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--red)",marginBottom:4}}>Gap: {g.gap}</div>
                    <div style={{fontSize:13,color:"var(--green)",lineHeight:1.5}}>→ {g.recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Implementation Roadmap */}
          {solutionFit.implementationRoadmap && (
            <div className="bb">
              <div className="bb-hdr">
                <div className="bb-icon" style={{fontSize:14}}>🗺</div>
                <div><div className="bb-title">Implementation Roadmap</div><div className="bb-sub">Recommended phasing based on their outcomes and architecture</div></div>
              </div>
              <div className="bb-body">
                <div style={{fontSize:14,color:"var(--ink-1)",lineHeight:1.7}}>{solutionFit.implementationRoadmap}</div>
              </div>
            </div>
          )}

          {/* Success Metrics */}
          {(solutionFit.successMetrics||[]).filter(Boolean).length>0 && (
            <div className="bb">
              <div className="bb-hdr">
                <div className="bb-icon" style={{fontSize:14}}>📊</div>
                <div><div className="bb-title">Success Metrics</div><div className="bb-sub">What winning looks like — measurable, tied to their outcomes</div></div>
              </div>
              <div className="bb-body">
                {solutionFit.successMetrics.filter(Boolean).map((m,i)=>(
                  <div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"flex-start"}}>
                    <div style={{width:20,height:20,borderRadius:"50%",background:"var(--green)",color:"var(--surface)",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{i+1}</div>
                    <div style={{fontSize:14,color:"var(--ink-1)",lineHeight:1.6}}>{m}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discovery Gaps — what the rep needs to capture next */}
          {(solutionFit.discoveryGaps||[]).filter(Boolean).length > 0 && (
            <div style={{background:"var(--amber-bg)",border:"1.5px solid var(--amber)",borderRadius:14,padding:"16px 20px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--amber)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>{solutionFit._preCall ? "Validate on Your Call" : "Missing Discovery Data — Capture on Next Call"}</div>
              <div style={{fontSize:13,color:"var(--ink-1)",lineHeight:1.7,marginBottom:8}}>
                {solutionFit._preCall ? "This is a pre-call hypothesis. Confirm these questions on the call to firm up the recommendation." : "The following information was not captured during discovery. This SA review is based on incomplete data — go back and capture these on your next interaction to strengthen the assessment."}
              </div>
              {solutionFit.discoveryGaps.filter(Boolean).map((g, i) => (
                <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"flex-start"}}>
                  <span style={{color:"var(--amber)",fontWeight:700,flexShrink:0}}>!</span>
                  <div style={{fontSize:13,color:"var(--ink-2)",lineHeight:1.5}}>{g}</div>
                </div>
              ))}
            </div>
          )}

          {/* SA Recommendation */}
          {solutionFit.saRecommendation && (
            <div style={{background:"var(--ink-0)",borderRadius:14,padding:"20px 22px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tan-0)",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>Senior SA Recommendation</div>
              <div style={{fontSize:15,color:"var(--surface)",lineHeight:1.7,fontStyle:"italic"}}>"{solutionFit.saRecommendation}"</div>
            </div>
          )}

          {!embedded && (
            <div className="actions-row">
              <button className="btn btn-secondary" onClick={onBack}>← Live Call</button>
              <button className="btn btn-secondary" onClick={onRegenerate}>↻ Regenerate</button>
              <button className="btn btn-navy" onClick={onExport}>Save as PDF</button>
              {(onCSV||onDownloadData) && <button className="btn btn-secondary" onClick={onCSV||onDownloadData}>CSV</button>}
              {onNext && <button className="btn btn-green btn-lg" onClick={onNext}>Route Deal →</button>}
              <button className="btn btn-primary" onClick={onNextAccount}>Next Account</button>
            </div>
          )}
        </>
      )}

      {!solutionFit && !solutionFitLoading && (
        <div style={{background:"var(--bg-1)",border:"1.5px dashed var(--line-2)",borderRadius:12,padding:32,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:12}}>🏗</div>
          <div style={{fontSize:15,fontWeight:600,color:"var(--ink-0)",marginBottom:6}}>Solution Architecture Review</div>
          <div style={{fontSize:13,color:"var(--ink-2)",marginBottom:20,maxWidth:400,margin:"0 auto 20px"}}>Evaluate solution fit against what you heard in the call. Maps customer needs to your solutions using SA principles.</div>
          {!embedded && <button className="btn btn-primary btn-lg" onClick={onRun}>Run Solution Fit Review →</button>}
          {embedded && <div style={{fontSize:13,color:"var(--ink-3)"}}>Solution architecture is building — it will appear here.</div>}
        </div>
      )}
    </>
  );
  if (embedded) return inner;
  return <div className="page">{inner}</div>;
}
