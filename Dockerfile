# Dockerfile for creating image used for running experiments on DiffKemp
FROM docker://nixos/nix
ARG KERNEL_VERSIONS="\
    4.18.0-80.el8 \
    4.18.0-147.el8 \
    4.18.0-193.el8 \
    4.18.0-240.el8 \
    4.18.0-305.el8 \
    4.18.0-348.el8"
ENV KERNEL_VERSIONS=$KERNEL_VERSIONS

# Enabling flakes, symlink bash to be able to configure kernels
RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    ln -s `which bash` /bin/bash

# Saving source files of experiments

# Saving RHEL kernel sources
# Note: Necessary to have two copies for RHEL to be able to build simultionasly
# snapshots for sysctl and functions without causing race conditions.
RUN git clone https://github.com/diffkemp/diffkemp --depth 1 /diffkemp && \
    (cd /diffkemp && nix build) && \
    nix develop /diffkemp --command bash -c '\
    mkdir -p /experiments/sources/kernel/functions && \
    for version in ${KERNEL_VERSIONS[@]}; do \
      echo $version; \
      rhel-kernel-get --kabi -o /experiments/sources/kernel/functions ${version}; \
      (cd /experiments/sources/kernel/functions/linux-${version} && make cscope); \
    done'

RUN (cd /diffkemp && nix build) && \
    nix develop /diffkemp --command bash -c '\
    mkdir -p /experiments/sources/kernel/sysctl && \
    for version in ${KERNEL_VERSIONS[@]}; do \
      echo $version; \
      cp -r /experiments/sources/kernel/functions/linux-${version} /experiments/sources/kernel/sysctl; \
      (cd /experiments/sources/kernel/sysctl/linux-${version} && make cscope); \
    done' && \
    rm -rf /diffkemp

# Saving EqBench sources
RUN mkdir -p /experiments/sources && \
    (git clone https://github.com/shrbadihi/eqbench /experiments/sources/eqbench && \
     cd /experiments/sources/eqbench && \
     git checkout 3724fce5b287cc63165028444daf904f25b0158b)

# Tools for running experiments
RUN mkdir /tools && \
    git clone https://github.com/PLukas2018/EqBench-workflow -b evaluation-enhancements --depth 1 /tools/eqbench

# Additional dependencies
RUN nix-env -iA nixpkgs.gnused nixpkgs.diffutils nixpkgs.findutils

COPY .build-patches /build-patches
# Caching dependencies for older PRs to speed up analysis
ARG DIFFKEMP_CACHE_OLD=""
RUN if [[ -n "${DIFFKEMP_CACHE_OLD}" ]] ; then \
        git clone https://github.com/diffkemp/diffkemp --depth 1 /diffkemp && \
        (cd /diffkemp && git fetch origin 0a955ae3fd973dbbfb481ed9894ff32119195e16 && \
         git checkout 0a955ae3fd973dbbfb481ed9894ff32119195e16 && git apply /build-patches/* && \
         nix build && \
         nix develop --command nix-shell -p gcc13 \
        ) && \
        rm -rf /diffkemp; \
    fi

# For image rebuilds - install latest DiffKemp nix dependencies
ARG DIFFKEMP_NIX_CACHEBUST=""
RUN if [[ -n "${DIFFKEMP_NIX_CACHEBUST}" ]] ; then \
        git clone https://github.com/diffkemp/diffkemp --depth 1 /diffkemp && \
        (cd /diffkemp && nix build && nix develop) && \
        rm -rf /diffkemp; \
    fi
