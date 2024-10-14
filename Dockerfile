# Dockerfile for creating image used for running experiments on DiffKemp
FROM docker://nixos/nix

# Enabling flakes
RUN echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf
# Caching DiffKemp Nix dependencies
RUN git clone https://github.com/diffkemp/diffkemp --depth 1 /diffkemp && \
    cd /diffkemp && nix build && nix develop
# Removing DiffKemp. Clone appropriate version when using container!
RUN rm -rf /diffkemp
