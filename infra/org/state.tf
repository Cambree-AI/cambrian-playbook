# State bucket for this layer (and only this layer - each env account gets
# its own state bucket, created by its own bootstrap, so dev credentials can
# never read prod state).
#
# Chicken-and-egg: this bucket is created by the same module that wants to
# store state in it. First apply uses local state; then uncomment the backend
# block in versions.tf and run `terraform init -migrate-state`.

resource "aws_s3_bucket" "tf_state" {
  bucket = "cambree-org-terraform-state-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
