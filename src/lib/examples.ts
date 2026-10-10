import { makeCell, makeNotebook, type Notebook } from './model'

type Spec = ['md' | 'py', string]

const build = (name: string, cells: Spec[]): Notebook =>
  makeNotebook(name, cells.map(([t, s]) => makeCell(t === 'md' ? 'markdown' : 'code', s.trim())))

export interface Example {
  key: string
  title: string
  make(): Notebook
}

export const EXAMPLES: Example[] = [
  {
    key: 'welcome',
    title: 'Welcome',
    make: () =>
      build('Welcome', [
        ['md', `# Python in your browser\n\nThis notebook runs **real CPython** compiled to WebAssembly ([Pyodide](https://pyodide.org)). Nothing is sent to a server.\n\n- **Shift+Enter** runs a cell and moves on, **Ctrl+Enter** runs it in place.\n- Packages such as NumPy, SciPy, pandas and Matplotlib load automatically when you import them.\n- Markdown cells support math: $e^{i\\pi} + 1 = 0$, or in display mode\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$`],
        ['py', `import sys\nprint(sys.version)\n2 ** 100`],
        ['py', `import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 2 * np.pi, 200)\nplt.plot(x, np.sin(x), label="sin")\nplt.plot(x, np.cos(x), label="cos")\nplt.legend()\nplt.title("Hello, Pyodide")\nplt.show()`],
        ['md', `Need another package? Use \`%pip install name\` (pure-Python wheels from PyPI work through micropip). Use the **Files** panel to upload data into the in-browser file system and read it with \`open()\` or \`pandas.read_csv()\`.`],
      ]),
  },
  {
    key: 'numpy',
    title: 'NumPy basics',
    make: () =>
      build('NumPy basics', [
        ['md', `# NumPy basics\n\nArrays, broadcasting and linear algebra.`],
        ['py', `import numpy as np\n\na = np.arange(12).reshape(3, 4)\nprint(a)\nprint("shape:", a.shape, "dtype:", a.dtype)\na`],
        ['md', `## Slicing and broadcasting\n\nSubtracting the column means from every row: $X_{ij} - \\bar{x}_j$.`],
        ['py', `centered = a - a.mean(axis=0)\nprint(centered)\nprint(a[:, 1:3])\nprint(a[a % 2 == 0])`],
        ['md', `## Linear algebra\n\nSolve $A\\mathbf{x} = \\mathbf{b}$ and check the residual.`],
        ['py', `A = np.array([[3.0, 1.0], [1.0, 2.0]])\nb = np.array([9.0, 8.0])\nx = np.linalg.solve(A, b)\nprint("x =", x)\nprint("residual:", np.abs(A @ x - b).max())\nnp.linalg.eig(A)`],
        ['md', `## Random numbers\n\nThe mean of many uniform samples approaches $1/2$ (law of large numbers).`],
        ['py', `import matplotlib.pyplot as plt\n\nrng = np.random.default_rng(42)\nsamples = rng.random((1000, 50))\nmeans = samples.mean(axis=1)\nplt.hist(means, bins=30, color="steelblue")\nplt.axvline(0.5, color="k", ls="--")\nplt.title("Means of 50 uniform samples")\nplt.show()\nmeans.mean(), means.std()`],
      ]),
  },
  {
    key: 'signal',
    title: 'SciPy signal filter',
    make: () =>
      build('SciPy signal filter', [
        ['md', `# Filtering a noisy signal with SciPy\n\nA 5 Hz sine buried in noise and a 60 Hz hum. A Butterworth low-pass filter of order $n$ has magnitude response\n\n$$|H(f)| = \\frac{1}{\\sqrt{1 + (f/f_c)^{2n}}}$$`],
        ['py', `import numpy as np\nimport matplotlib.pyplot as plt\nfrom scipy import signal\n\nfs = 500.0\nt = np.arange(0, 2, 1 / fs)\nrng = np.random.default_rng(0)\nclean = np.sin(2 * np.pi * 5 * t)\nnoisy = clean + 0.4 * np.sin(2 * np.pi * 60 * t) + 0.3 * rng.standard_normal(t.size)\n\nplt.figure(figsize=(8, 3))\nplt.plot(t, noisy, lw=0.8)\nplt.title("Noisy signal")\nplt.xlabel("time [s]")\nplt.show()`],
        ['py', `# 4th order Butterworth low-pass at 15 Hz, applied forwards and backwards (zero phase)\nb, a = signal.butter(4, 15, btype="low", fs=fs)\nfiltered = signal.filtfilt(b, a, noisy)\n\nplt.figure(figsize=(8, 3))\nplt.plot(t, noisy, alpha=0.4, label="noisy")\nplt.plot(t, filtered, label="filtered")\nplt.plot(t, clean, "k--", lw=1, label="clean")\nplt.legend(loc="upper right")\nplt.xlabel("time [s]")\nplt.show()\n\nprint("RMS error before:", np.sqrt(np.mean((noisy - clean) ** 2)).round(3))\nprint("RMS error after: ", np.sqrt(np.mean((filtered - clean) ** 2)).round(3))`],
        ['py', `# Frequency response and spectrum\nw, h = signal.freqz(b, a, fs=fs)\nf, pxx = signal.welch(noisy, fs=fs, nperseg=256)\n\nfig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9, 3))\nax1.plot(w, 20 * np.log10(np.abs(h) + 1e-12))\nax1.set_ylim(-80, 5)\nax1.set_title("Filter response [dB]")\nax1.set_xlabel("Hz")\nax2.semilogy(f, pxx)\nax2.set_title("Welch spectrum of the noisy signal")\nax2.set_xlabel("Hz")\nfig.tight_layout()\nplt.show()`],
      ]),
  },
  {
    key: 'curvefit',
    title: 'Curve fitting',
    make: () =>
      build('Curve fitting', [
        ['md', `# Non-linear curve fitting\n\nFit the decaying oscillation $y(t) = A e^{-t/\\tau}\\cos(\\omega t + \\varphi)$ to noisy data with \`scipy.optimize.curve_fit\`.`],
        ['py', `import numpy as np\nimport matplotlib.pyplot as plt\nfrom scipy.optimize import curve_fit\n\ndef model(t, A, tau, omega, phi):\n    return A * np.exp(-t / tau) * np.cos(omega * t + phi)\n\ntrue = dict(A=2.0, tau=3.0, omega=4.0, phi=0.5)\nrng = np.random.default_rng(1)\nt = np.linspace(0, 10, 120)\ny = model(t, **true) + 0.12 * rng.standard_normal(t.size)\n\nplt.scatter(t, y, s=10)\nplt.title("Measured data")\nplt.show()`],
        ['py', `p0 = [1.5, 2.0, 3.5, 0.0]  # initial guess\npopt, pcov = curve_fit(model, t, y, p0=p0)\nperr = np.sqrt(np.diag(pcov))\n\nfor name, v, e, tv in zip(["A", "tau", "omega", "phi"], popt, perr, true.values()):\n    print(f"{name:>5} = {v:7.3f} +/- {e:.3f}   (true {tv})")`],
        ['py', `tt = np.linspace(0, 10, 500)\nplt.figure(figsize=(8, 4))\nplt.scatter(t, y, s=10, label="data")\nplt.plot(tt, model(tt, *popt), "r", label="fit")\nplt.plot(tt, model(tt, **true), "k--", lw=1, label="truth")\nplt.legend()\nplt.xlabel("t")\nplt.show()\n\nresid = y - model(t, *popt)\nprint("residual std:", resid.std().round(4))`],
      ]),
  },
  {
    key: 'pandas',
    title: 'pandas CSV analysis',
    make: () =>
      build('pandas CSV analysis', [
        ['md', `# CSV analysis with pandas\n\nThis notebook writes a small sales CSV into the in-browser file system, then analyses it. To use your own data, upload a file in the **Files** panel and change the file name below.`],
        ['py', `import numpy as np\nimport pandas as pd\n\nrng = np.random.default_rng(7)\nn = 240\ndf = pd.DataFrame({\n    "date": pd.date_range("2025-01-01", periods=n, freq="D"),\n    "region": rng.choice(["North", "South", "East", "West"], n),\n    "product": rng.choice(["Widget", "Gadget", "Gizmo"], n),\n    "units": rng.integers(1, 40, n),\n    "price": rng.choice([9.5, 14.0, 22.0], n),\n})\ndf.to_csv("sales.csv", index=False)\nprint("wrote sales.csv,", len(df), "rows")`],
        ['py', `sales = pd.read_csv("sales.csv", parse_dates=["date"])\nsales["revenue"] = sales["units"] * sales["price"]\nsales.head()`],
        ['py', `sales.describe()`],
        ['py', `by_region = sales.groupby(["region", "product"])["revenue"].sum().unstack()\nby_region.round(1)`],
        ['py', `import matplotlib.pyplot as plt\n\nmonthly = sales.set_index("date")["revenue"].resample("MS").sum()\nfig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 3.5))\nmonthly.plot(ax=ax1, marker="o", title="Monthly revenue")\nby_region.plot.bar(ax=ax2, stacked=True, title="Revenue by region")\nfig.tight_layout()\nplt.show()`],
        ['py', `# Anything you write to the working directory shows up in the Files panel for download\nby_region.to_csv("revenue_by_region.csv")\nsales.groupby("region")["revenue"].agg(["sum", "mean", "count"]).sort_values("sum", ascending=False)`],
      ]),
  },
]

export function welcomeNotebook(): Notebook {
  return EXAMPLES[0].make()
}
