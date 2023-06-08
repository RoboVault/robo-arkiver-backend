# kubernetes

- implement horizontal pod autoscaling for arkive-runner
  - add SIGTERM handler in manager
- build images and push to ecr
  - get rid of imagePullPolicy: Never
- build images for cache-manager and data-manager
  - write config files for them
- add StatefulSet for influx and add a service for it