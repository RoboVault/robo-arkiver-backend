# kubernetes

- implement horizontal pod autoscaling for arkive-runner
  - add SIGTERM handler in manager
  - add kickback mechanism in arkiver-runner: kick jobs back to messenger
  - check for memory usage in arkiver-runner and stop listening for new jobs
    when full
- build images for cache-manager and data-manager
  - write config files for them
