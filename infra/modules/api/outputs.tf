output "api_endpoint" {
  description = "Invoke URL of the HTTP API (https://<id>.execute-api.<region>.amazonaws.com). Endpoints serve at <api_endpoint>/api/<name>."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "api_id" {
  description = "API Gateway HTTP API id."
  value       = aws_apigatewayv2_api.http.id
}

output "secret_name" {
  description = "Secrets Manager container the Lambdas read at cold start. Set its value once via `aws secretsmanager put-secret-value` (api-aws/README.md)."
  value       = aws_secretsmanager_secret.api_env.name
}

output "secret_arn" {
  description = "ARN of the api-env secret container."
  value       = aws_secretsmanager_secret.api_env.arn
}

output "lambda_function_names" {
  description = "Deployed Lambda names by endpoint, for `aws logs tail`/console lookups."
  value       = { for k, f in aws_lambda_function.endpoint : k => f.function_name }
}
