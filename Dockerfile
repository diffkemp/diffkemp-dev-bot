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
# Caching DiffKemp Nix dependencies
RUN git clone https://github.com/diffkemp/diffkemp --depth 1 /diffkemp && \
    cd /diffkemp && nix build && nix develop
# Tools for running experiments
RUN mkdir /tools && \
    git clone https://github.com/PLukas2018/EqBench-workflow -b evaluation-enhancements --depth 1 /tools/eqbench
# Source files of experiments
# Note: Necessary to have two copies for RHEL to be able to build simultionasly
# snapshots for sysctl and functions without causing race conditions.
RUN mkdir -p /experiments/sources && \
    (git clone https://github.com/shrbadihi/eqbench /experiments/sources/eqbench && \
     cd /experiments/sources/eqbench && \
     git checkout 3724fce5b287cc63165028444daf904f25b0158b) && \
    nix develop /diffkemp --command bash -c '\
      mkdir -p /experiments/sources/kernel/functions && \
      mkdir -p /experiments/sources/kernel/sysctl && \
      for version in ${KERNEL_VERSIONS[@]}; do \
        echo $version; \
        rhel-kernel-get --kabi -o /experiments/sources/kernel/functions ${version}; \
        (cd /experiments/sources/kernel/functions/linux-${version} && make cscope); \
        cp -r /experiments/sources/kernel/functions/linux-${version} /experiments/sources/kernel/sysctl; \
        (cd /experiments/sources/kernel/sysctl/linux-${version} && make cscope); \
      done'
# Removing DiffKemp. Clone appropriate version when using container!
RUN rm -rf /diffkemp
