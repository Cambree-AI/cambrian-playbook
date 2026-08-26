output "app_id" {
  description = "Amplify app id"
  value       = aws_amplify_app.this.id
}

output "default_domain" {
  description = "Amplify default domain; the branch serves at <branch>.<this>"
  value       = aws_amplify_app.this.default_domain
}

output "branch_url" {
  description = "HTTPS URL the environment branch serves at (default domain)"
  value       = "https://${aws_amplify_branch.this.branch_name}.${aws_amplify_app.this.default_domain}"
}
