#!/bin/bash

# SatyaShield Production Deployment Script
# This script deploys the complete SatyaShield platform to production

set -euo pipefail

# Configuration
NAMESPACE="satyashield"
DOCKER_REGISTRY="registry.satyashield.com"
VERSION_TAG=${1:-"latest"}
ENVIRONMENT=${2:-"production"}
KUBECTL_CONTEXT="satyashield-production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validation functions
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "docker is not installed"
        exit 1
    fi
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed"
        exit 1
    fi
    
    # Check kubectl context
    if ! kubectl config get-contexts | grep -q "$KUBECTL_CONTEXT"; then
        log_error "Kubectl context '$KUBECTL_CONTEXT' not found"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Docker build and push functions
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    # Frontend
    log_info "Building frontend image..."
    docker build -t ${DOCKER_REGISTRY}/satyashield-frontend:${VERSION_TAG} \
        -f deployment/docker/frontend.Dockerfile frontend/
    docker push ${DOCKER_REGISTRY}/satyashield-frontend:${VERSION_TAG}
    
    # Backend
    log_info "Building backend image..."
    docker build -t ${DOCKER_REGISTRY}/satyashield-backend:${VERSION_TAG} \
        -f deployment/docker/backend.Dockerfile backend/
    docker push ${DOCKER_REGISTRY}/satyashield-backend:${VERSION_TAG}
    
    # AI Engine
    log_info "Building AI engine image..."
    docker build -t ${DOCKER_REGISTRY}/satyashield-ai-engine:${VERSION_TAG} \
        -f deployment/docker/ai-engine.Dockerfile ai-engine/
    docker push ${DOCKER_REGISTRY}/satyashield-ai-engine:${VERSION_TAG}
    
    # Nginx
    log_info "Building nginx image..."
    docker build -t ${DOCKER_REGISTRY}/satyashield-nginx:${VERSION_TAG} \
        -f deployment/docker/nginx.Dockerfile deployment/nginx/
    docker push ${DOCKER_REGISTRY}/satyashield-nginx:${VERSION_TAG}
    
    log_success "All images built and pushed successfully"
}

# Database migration functions
run_database_migrations() {
    log_info "Running database migrations..."
    
    # Create migration job
    kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: satyashield-migration-${VERSION_TAG}
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: migration
        image: ${DOCKER_REGISTRY}/satyashield-backend:${VERSION_TAG}
        command: ["npm", "run", "db:migrate"]
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: satyashield-secrets
              key: mongodb-uri
        - name: NODE_ENV
          value: "${ENVIRONMENT}"
      restartPolicy: OnFailure
  backoffLimit: 3
EOF
    
    # Wait for migration to complete
    log_info "Waiting for migration to complete..."
    kubectl wait --for=condition=complete job/satyashield-migration-${VERSION_TAG} \
        --namespace=${NAMESPACE} --timeout=300s
    
    log_success "Database migration completed"
}

# Kubernetes deployment functions
deploy_infrastructure() {
    log_info "Deploying infrastructure components..."
    
    # Set kubectl context
    kubectl config use-context ${KUBECTL_CONTEXT}
    
    # Create namespace if it doesn't exist
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply configurations
    log_info "Applying ConfigMaps and Secrets..."
    kubectl apply -f deployment/kubernetes/namespace.yaml
    kubectl apply -f deployment/kubernetes/configmaps.yaml
    kubectl apply -f deployment/kubernetes/secrets.yaml
    
    # Deploy databases
    log_info "Deploying databases..."
    kubectl apply -f deployment/kubernetes/mongodb-deployment.yaml
    kubectl apply -f deployment/kubernetes/redis-deployment.yaml
    
    # Wait for databases to be ready
    log_info "Waiting for databases to be ready..."
    kubectl wait --for=condition=ready pod -l app=mongodb \
        --namespace=${NAMESPACE} --timeout=300s
    kubectl wait --for=condition=ready pod -l app=redis \
        --namespace=${NAMESPACE} --timeout=300s
    
    log_success "Infrastructure deployed successfully"
}

deploy_applications() {
    log_info "Deploying application components..."
    
    # Update image tags in deployment files
    sed -i.bak "s|:latest|:${VERSION_TAG}|g" deployment/kubernetes/*-deployment.yaml
    
    # Deploy applications
    kubectl apply -f deployment/kubernetes/backend-deployment.yaml
    kubectl apply -f deployment/kubernetes/ai-engine-deployment.yaml
    kubectl apply -f deployment/kubernetes/frontend-deployment.yaml
    
    # Deploy services
    kubectl apply -f deployment/kubernetes/services.yaml
    
    # Deploy ingress
    kubectl apply -f deployment/kubernetes/ingress.yaml
    
    # Deploy HPA
    kubectl apply -f deployment/kubernetes/hpa.yaml
    
    log_success "Applications deployed successfully"
}

# Health check functions
wait_for_deployment() {
    log_info "Waiting for deployments to be ready..."
    
    # Wait for backend
    kubectl rollout status deployment/satyashield-backend \
        --namespace=${NAMESPACE} --timeout=600s
    
    # Wait for AI engine
    kubectl rollout status deployment/satyashield-ai-engine \
        --namespace=${NAMESPACE} --timeout=600s
    
    # Wait for frontend
    kubectl rollout status deployment/satyashield-frontend \
        --namespace=${NAMESPACE} --timeout=600s
    
    log_success "All deployments are ready"
}

run_health_checks() {
    log_info "Running health checks..."
    
    # Get service endpoints
    BACKEND_URL=$(kubectl get service satyashield-backend \
        --namespace=${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    AI_ENGINE_URL=$(kubectl get service satyashield-ai-engine \
        --namespace=${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    # Backend health check
    if curl -f "http://${BACKEND_URL}:5000/health" > /dev/null 2>&1; then
        log_success "Backend health check passed"
    else
        log_error "Backend health check failed"
        return 1
    fi
    
    # AI Engine health check
    if curl -f "http://${AI_ENGINE_URL}:8000/health" > /dev/null 2>&1; then
        log_success "AI Engine health check passed"
    else
        log_error "AI Engine health check failed"
        return 1
    fi
    
    log_success "All health checks passed"
}

# Monitoring setup
setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Deploy Prometheus
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --create-namespace \
        --set grafana.adminPassword=admin \
        --values deployment/monitoring/prometheus-values.yaml
    
    # Deploy custom dashboards
    kubectl apply -f deployment/monitoring/dashboards/
    
    log_success "Monitoring setup completed"
}

# Backup functions
create_backup() {
    log_info "Creating pre-deployment backup..."
    
    # Create backup job
    kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: satyashield-backup-$(date +%Y%m%d-%H%M%S)
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: backup
        image: ${DOCKER_REGISTRY}/satyashield-backend:${VERSION_TAG}
        command: ["npm", "run", "backup"]
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: satyashield-secrets
              key: mongodb-uri
        - name: BACKUP_S3_BUCKET
          value: "satyashield-backups"
      restartPolicy: OnFailure
EOF
    
    log_success "Backup job created"
}

# Rollback functions
rollback_deployment() {
    log_error "Deployment failed. Initiating rollback..."
    
    # Rollback deployments
    kubectl rollout undo deployment/satyashield-backend --namespace=${NAMESPACE}
    kubectl rollout undo deployment/satyashield-ai-engine --namespace=${NAMESPACE}
    kubectl rollout undo deployment/satyashield-frontend --namespace=${NAMESPACE}
    
    # Wait for rollback to complete
    kubectl rollout status deployment/satyashield-backend --namespace=${NAMESPACE}
    kubectl rollout status deployment/satyashield-ai-engine --namespace=${NAMESPACE}
    kubectl rollout status deployment/satyashield-frontend --namespace=${NAMESPACE}
    
    log_success "Rollback completed"
}

# Notification functions
send_deployment_notification() {
    local status=$1
    local message=$2
    
    # Send Slack notification (if webhook URL is configured)
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"SatyaShield Deployment ${status}: ${message}\"}" \
            "${SLACK_WEBHOOK_URL}"
    fi
    
    # Send email notification (if configured)
    if [[ -n "${NOTIFICATION_EMAIL:-}" ]]; then
        echo "${message}" | mail -s "SatyaShield Deployment ${status}" "${NOTIFICATION_EMAIL}"
    fi
}

# Main deployment function
main() {
    log_info "Starting SatyaShield deployment (Version: ${VERSION_TAG}, Environment: ${ENVIRONMENT})"
    
    # Trap to handle failures
    trap 'log_error "Deployment failed at line $LINENO"; rollback_deployment; send_deployment_notification "FAILED" "Deployment failed and rolled back"; exit 1' ERR
    
    # Pre-deployment steps
    check_prerequisites
    create_backup
    
    # Build and push images
    build_and_push_images
    
    # Deploy infrastructure
    deploy_infrastructure
    
    # Run migrations
    run_database_migrations
    
    # Deploy applications
    deploy_applications
    
    # Wait for deployment
    wait_for_deployment
    
    # Health checks
    run_health_checks
    
    # Setup monitoring
    setup_monitoring
    
    # Success notification
    send_deployment_notification "SUCCESS" "SatyaShield ${VERSION_TAG} deployed successfully to ${ENVIRONMENT}"
    
    log_success "SatyaShield deployment completed successfully!"
    log_info "Dashboard: https://satyashield.com"
    log_info "API Documentation: https://api.satyashield.com/api-docs"
    log_info "Monitoring: https://monitoring.satyashield.com"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
