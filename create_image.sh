#!/usr/bin/env bash
# Creates podman image for running experiments
PREV_IMAGE_ID=$(podman images diffkemp-prs:latest -q)
podman build -t diffkemp-prs . && \
# Try to remove the old image, do not fail if it cannot be removed
# (e.g. it is used right now)
podman rmi $PREV_IMAGE_ID || true
