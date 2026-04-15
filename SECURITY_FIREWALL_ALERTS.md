# Firewall and Alerting Runbook

## 1. Edge Firewall Baseline (Cloud Security Group)
Allow only required inbound ports to the cluster/ingress nodes:
- 80/TCP from 0.0.0.0/0 (for HTTP->HTTPS redirects only)
- 443/TCP from 0.0.0.0/0

Deny all other inbound ports, especially:
- 22/TCP (unless bastion/VPN restricted)
- 27017/TCP (MongoDB)
- 6379/TCP (Redis)
- 5000/TCP (backend app direct)
- 9090/TCP (Prometheus)
- 9093/TCP (Alertmanager)
- 3000/TCP (Grafana)

## 2. Internal Network Policy
Apply Kubernetes network policies to limit east-west traffic:
```bash
kubectl apply -f k8s/network-policies.yaml
```

## 3. Ingress Abuse Protection
Ingress manifests include:
- request rate limiting
- connection limiting
- ModSecurity + OWASP CRS

Apply:
```bash
kubectl apply -f k8s/ingress-prod.yaml
```

## 4. Alerting Stack Deployment
```bash
kubectl apply -f k8s/alertmanager-configmap.yaml
kubectl apply -f k8s/alertmanager-deployment.yaml
kubectl apply -f k8s/prometheus-configmap.yaml
kubectl apply -f k8s/prometheus-deployment.yaml
```

## 5. Critical Alerts Configured
- `BackendDown`
- `HighAuthFailureRate`
- `Elevated5xxRate`
- `SuspiciousAdminEndpointFailures`

Routing policy:
- Non-production alerts are routed to Slack only.
- Production backend critical alerts page PagerDuty.
- Production backend warning alerts route to email.

## 6. Verify Alert Path
```bash
kubectl get pods | grep -E 'prometheus|alertmanager'
kubectl logs deploy/prometheus | grep -i alert
kubectl port-forward svc/prometheus 9090:9090
```
Then open Prometheus Alerts tab and confirm rules are loaded.

## 7. Integrate Notification Channels
Set these keys in `k8s/secrets.yaml` and apply:
- `ALERT_SLACK_WEBHOOK_URL`
- `ALERT_EMAIL_FROM`
- `ALERT_EMAIL_SMARTHOST` (example: `smtp.gmail.com:587`)
- `ALERT_EMAIL_AUTH_USERNAME`
- `ALERT_EMAIL_AUTH_PASSWORD`
- `ALERT_EMAIL_TO`
- `ALERT_PAGERDUTY_ROUTING_KEY`

Reapply and restart:
```bash
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/alertmanager-configmap.yaml
kubectl rollout restart deploy/alertmanager
```

Validate effective config:
```bash
kubectl logs deploy/alertmanager | grep -i "Loading configuration file"
kubectl port-forward svc/alertmanager 9093:9093
curl -s http://localhost:9093/api/v2/status
```

## 8. Continuous Security Gates (CI)
Security workflow runs on push/PR:
- backend security tests
- npm audit checks
- gitleaks secret scanning
- trivy vulnerability scanning
- kube-score manifest checks

Workflow file:
- `.github/workflows/security-audit.yml`

## 9. Environment Labeling Note
Prometheus sets `environment=production` as an external label in `k8s/prometheus-configmap.yaml`.
For non-production clusters, override this label to `staging` or `dev` before deployment.
