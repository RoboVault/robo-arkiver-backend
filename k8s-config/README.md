# k8s-config

## Updating a service

### Prerequisites

- [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
- [aws cli](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html)
- [docker](https://docs.docker.com/get-docker/)

### Configure kubeconfig

```bash
aws eks --region <region> update-kubeconfig --name <cluster_name>
```

### Deploy

- Build the docker image
- [Push to ECR](https://us-east-1.console.aws.amazon.com/ecr/repositories?region=us-east-1)
- Rollout the deployment

```bash
kubectl rollout restart deployment/<deployment_name>
```
