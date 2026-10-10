import base64, io, json, linecache, os, sys, traceback, warnings

os.environ.setdefault("MPLBACKEND", "AGG")

import js
from pyodide.code import eval_code_async

_ns = {"__name__": "__main__"}


def _emit(mime, data):
    js.__nbEmit(json.dumps({mime: data}))


def _bundle(obj):
    """MIME bundle for a value, richest representation first."""
    out = {}
    try:
        import matplotlib.figure as _mf
        if isinstance(obj, _mf.Figure):
            buf = io.BytesIO()
            obj.savefig(buf, format="png", dpi=100, bbox_inches="tight")
            out["image/png"] = base64.b64encode(buf.getvalue()).decode()
            out["text/plain"] = repr(obj)
            return out
    except ImportError:
        pass
    for name, mime in (("_repr_html_", "text/html"), ("_repr_markdown_", "text/markdown"),
                       ("_repr_svg_", "image/svg+xml"), ("_repr_latex_", "text/latex")):
        f = getattr(type(obj), name, None)
        if f is not None:
            try:
                v = f(obj)
            except Exception:
                v = None
            if isinstance(v, str):
                out[mime] = v
                break
    try:
        out["text/plain"] = repr(obj)
    except Exception as e:
        out["text/plain"] = f"<repr failed: {e}>"
    return out


def display(*objs):
    for o in objs:
        js.__nbEmit(json.dumps(_bundle(o)))


def _flush_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return
    for num in plt.get_fignums():
        fig = plt.figure(num)
        display(fig)
    plt.close("all")


def _install_hooks():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is not None and not getattr(plt, "_nb_patched", False):
        plt.show = lambda *a, **k: _flush_figures()
        plt._nb_patched = True


_ns["display"] = display


def _prepare(code):
    """Make matplotlib render inline: Agg backend plus a show() that emits PNGs."""
    if "matplotlib" not in code and "pylab" not in code:
        return
    try:
        import matplotlib
        matplotlib.use("agg")
        warnings.filterwarnings("ignore", category=matplotlib.MatplotlibDeprecationWarning)
        import matplotlib.pyplot as plt
        if not getattr(plt, "_nb_patched", False):
            plt.show = lambda *a, **k: _flush_figures()
            plt._nb_patched = True
    except Exception:
        pass


async def _run(code, label):
    out = {}
    try:
        linecache.cache[label] = (len(code), None, code.splitlines(True), label)
        _prepare(code)
        result = await eval_code_async(code, _ns, return_mode="last_expr", quiet_trailing_semicolon=True,
                                       filename=label)
        if result is not None:
            out["result"] = _bundle(result)
    except BaseException as e:
        tb = e.__traceback__
        while tb is not None and tb.tb_frame.f_code.co_filename != label:
            tb = tb.tb_next
        if tb is None:
            lines = traceback.format_exception_only(type(e), e)
        else:
            lines = ["Traceback (most recent call last):\n"] + traceback.format_list(traceback.extract_tb(tb)) \
                + traceback.format_exception_only(type(e), e)
        out["error"] = {"ename": type(e).__name__, "evalue": str(e), "traceback": "".join(lines).rstrip("\n").split("\n")}
    try:
        _flush_figures()
    except Exception:
        pass
    sys.stdout.flush()
    sys.stderr.flush()
    return json.dumps(out)
