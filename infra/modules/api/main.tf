# infra/modules/api — issue #86. HTTP API (cheaper/simpler than REST; auth is
# JWT-in-code via the shared guard to keep api/_guard.js semantics, NOT an
# API Gateway authorizer), one Lambda per endpoint, per-env Secrets Manager
# container, CloudWatch log groups. Routes mirror the Vercel paths
# (/api/<name>) so the client's endpoint-origin swap is mechanical.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

locals {
  api_name = "${var.name_prefix}-${var.env}-api"
  # Lambda names are computed up front so log groups can be created with
  # retention BEFORE the function first writes to them.
  fn_names = { for k, v in var.endpoints : k => "${local.api_name}-${k}" }
}

# ── Secrets container (issue #86 pattern) ────────────────────────────────
# Terraform creates ONLY the container - deliberately no
# aws_secretsmanager_secret_version, so no secret value ever exists in git
# or in Terraform state. The value (a JSON object of server env vars) is set
# once per env, out of band:
#   aws secretsmanager put-secret-value --secret-id <name> --secret-string file://...
# See api-aws/README.md for the documented step.
resource "aws_secretsmanager_secret" "api_env" {
  name        = "${var.name_prefix}/${var.env}/api-env"
  description = "Server-side env vars for the ${var.env} API Lambdas (JSON object). Value set manually - never via Terraform."
}

# ── HTTP API ─────────────────────────────────────────────────────────────
# No cors_configuration on purpose: CORS is answered by the shared guard in
# code, byte-identical to the Vercel behavior from issue #83. API Gateway
# CORS would answer preflights itself and drift from that contract.
resource "aws_apigatewayv2_api" "http" {
  name          = local.api_name
  protocol_type = "HTTP"
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.api_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      path             = "$context.path"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integration.error"
    })
  }
}

# ── Per-endpoint IAM ─────────────────────────────────────────────────────
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "endpoint" {
  for_each = var.endpoints

  name               = "${local.fn_names[each.key]}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  for_each = var.endpoints

  role       = aws_iam_role.endpoint[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "read_secret" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.api_env.arn]
  }
}

resource "aws_iam_role_policy" "read_secret" {
  for_each = var.endpoints

  name   = "read-api-env-secret"
  role   = aws_iam_role.endpoint[each.key].id
  policy = data.aws_iam_policy_document.read_secret.json
}

# ── Lambdas ──────────────────────────────────────────────────────────────
# CI builds api-aws/dist/<name>/index.mjs (esbuild); archive_file zips it at
# plan time, so a code-only merge produces a changed source_code_hash and
# redeploys through the same pipeline as infra changes.
data "archive_file" "endpoint" {
  for_each = var.endpoints

  type        = "zip"
  source_dir  = "${var.dist_dir}/${each.key}"
  output_path = "${var.dist_dir}/${each.key}.zip"
}

resource "aws_cloudwatch_log_group" "endpoint" {
  for_each = var.endpoints

  name              = "/aws/lambda/${local.fn_names[each.key]}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "endpoint" {
  for_each = var.endpoints

  function_name = local.fn_names[each.key]
  role          = aws_iam_role.endpoint[each.key].arn

  filename         = data.archive_file.endpoint[each.key].output_path
  source_code_hash = data.archive_file.endpoint[each.key].output_base64sha256

  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  timeout       = each.value.timeout_seconds
  memory_size   = each.value.memory_mb

  environment {
    # Precedence note: shared/secrets.js merges the secret's keys into
    # process.env WITHOUT overriding values set here.
    variables = merge(
      var.common_environment,
      {
        CAMBREE_ENV = var.env
        SECRETS_ARN = aws_secretsmanager_secret.api_env.arn
      },
      each.value.environment,
    )
  }

  depends_on = [aws_cloudwatch_log_group.endpoint]
}

# ── Routing ──────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "endpoint" {
  for_each = var.endpoints

  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.endpoint[each.key].invoke_arn
  payload_format_version = "2.0"
}

# ANY (not just POST): method policy (405s) and OPTIONS preflight stay in the
# handler/guard code, matching Vercel routing behavior.
resource "aws_apigatewayv2_route" "endpoint" {
  for_each = var.endpoints

  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /api/${each.key}"
  target    = "integrations/${aws_apigatewayv2_integration.endpoint[each.key].id}"
}

resource "aws_lambda_permission" "apigw" {
  for_each = var.endpoints

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.endpoint[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
