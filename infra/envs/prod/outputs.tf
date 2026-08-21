output "account_id" {
  description = "Account this layer manages — sanity check that CI applied the right env"
  value       = data.aws_caller_identity.current.account_id
}

output "state_bucket" {
  description = "This layer's Terraform state bucket"
  value       = aws_s3_bucket.tf_state.id
}
