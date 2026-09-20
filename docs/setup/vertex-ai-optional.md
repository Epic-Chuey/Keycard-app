# Setup: Vertex AI for the Standup tab's AI summaries (step 8b — currently unused)

> Part of the [setup walkthrough](../../SETUP.md), itself part of the [documentation map](../../CLAUDE.md#documentation-map). Sits between [step 8](secrets-deploy-and-install.md) and [step 9](secrets-deploy-and-install.md#9-deploy); broken out since nothing here is needed for a fresh setup today.

`summarizeStandupEntries` (`functions/index.js`, 2026-08-04) calls Vertex AI Gemini to write a one-line summary per pulled email — no API key to obtain/paste, unlike the `MS_*` secrets in [step 8](secrets-deploy-and-install.md#8-set-the-cloud-function-secrets).

**Disabled as of 2026-08-02:** no longer called from `pullStandupEmails`; client no longer shows a summary line. It had never actually worked — the model called (`gemini-2.0-flash-001`) was retired by Google 2026-06-01, so every call 404'd and silently fell back to a plain-text excerpt. Code's since been updated to `gemini-3.5-flash`, but the feature stays disabled. Left in place for a possible re-enable — see [Standup tab](../standup-tab.md)'s "AI summaries" note for the client-side half.

If re-wired, needs two things in the **same Firebase/GCP project** (no new project needed) before the Cloud Function's service account can call Vertex AI:

```bash
gcloud services enable aiplatform.googleapis.com --project=<your-project-id>

# Find the Cloud Functions runtime service account (usually
# <project-number>-compute@developer.gserviceaccount.com — check IAM & Admin
# > IAM if unsure) and grant Vertex AI access:
gcloud projects add-iam-policy-binding <your-project-id> \
  --member="serviceAccount:<project-number>-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

`summarizeStandupEntries` fails closed on any error (missing IAM role, API not enabled, retired model string, quota, etc.) — check Cloud Function logs for `"summarizeStandupEntries failed:"` if re-wired and still seemingly inert.
