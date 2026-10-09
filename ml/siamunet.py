"""FC-Siam-diff style U-Net for bi-temporal change detection on 5-band Sentinel-2 (about 1.2 M parameters).

A shared encoder reads the before and after images; the decoder is fed the absolute difference of the
two encoders' skip features (Daudt et al., 2018). Input: [N, 10, H, W] = 5 before bands then 5 after
bands (normalised); output: [N, 1, H, W] change logits. H and W must be divisible by 8.
"""
from __future__ import annotations

try:
    import torch
except ImportError as e:  # the trainers and the exporter need PyTorch; the engine and the evals do not
    raise ImportError("PyTorch is required for this tool: pip install -r requirements-ml.txt "
                      "(use the CUDA build from pytorch.org for a GPU)") from e
from torch import nn

N_BANDS = 5


def block(cin, cout):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
                         nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class SiamUNet(nn.Module):
    def __init__(self, base=24, bands=N_BANDS):
        super().__init__()
        self.bands = bands
        c = [base, base * 2, base * 4, base * 8]
        self.e1, self.e2, self.e3, self.e4 = block(bands, c[0]), block(c[0], c[1]), block(c[1], c[2]), block(c[2], c[3])
        self.pool = nn.MaxPool2d(2)
        self.u3, self.d3 = nn.ConvTranspose2d(c[3], c[2], 2, 2), block(c[2] * 2, c[2])
        self.u2, self.d2 = nn.ConvTranspose2d(c[2], c[1], 2, 2), block(c[1] * 2, c[1])
        self.u1, self.d1 = nn.ConvTranspose2d(c[1], c[0], 2, 2), block(c[0] * 2, c[0])
        self.drop = nn.Dropout2d(0.1)
        self.head = nn.Conv2d(c[0], 1, 1)

    def encode(self, x):
        f1 = self.e1(x)
        f2 = self.e2(self.pool(f1))
        f3 = self.e3(self.pool(f2))
        f4 = self.e4(self.pool(f3))
        return f1, f2, f3, f4

    def forward(self, x):
        a, b = self.encode(x[:, :self.bands]), self.encode(x[:, self.bands:])
        d = self.d3(torch.cat([self.u3(torch.abs(b[3] - a[3])), torch.abs(b[2] - a[2])], 1))
        d = self.d2(torch.cat([self.u2(d), torch.abs(b[1] - a[1])], 1))
        d = self.d1(torch.cat([self.u1(d), torch.abs(b[0] - a[0])], 1))
        return self.head(self.drop(d))


def n_params(model) -> int:
    return sum(p.numel() for p in model.parameters())
