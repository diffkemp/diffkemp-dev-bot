# Dockerfile for creating image used for running experiments on DiffKemp
FROM docker://nixos/nix

# Enabling flakes
RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf
# Caching DiffKemp Nix dependencies
RUN git clone https://github.com/diffkemp/diffkemp --depth 1 /diffkemp && \
    cd /diffkemp && nix build && nix develop
# Tools for running experiments
RUN mkdir /tools && \
    git clone https://github.com/PLukas2018/EqBench-workflow -b evaluation-enhancements --depth 1 /tools/eqbench
# Source files of experiments
RUN mkdir -p /experiments/sources && \
    (git clone https://github.com/shrbadihi/eqbench /experiments/sources/eqbench && \
     cd /experiments/sources/eqbench && \
     git checkout 3724fce5b287cc63165028444daf904f25b0158b)
# Removing DiffKemp. Clone appropriate version when using container!
RUN rm -rf /diffkemp
