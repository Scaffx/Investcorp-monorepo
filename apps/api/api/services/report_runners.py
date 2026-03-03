from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import uuid


@dataclass(frozen=True)
class JobPaths:
    base: Path
    modelos: Path
    regras: Path

    @staticmethod
    def create(media_root: Path) -> "JobPaths":
        job_id = uuid.uuid4().hex
        base = media_root / "reports" / job_id
        modelos = base / "Modelos"
        regras = base / "REGRAS"
        modelos.mkdir(parents=True, exist_ok=True)
        regras.mkdir(parents=True, exist_ok=True)
        return JobPaths(base=base, modelos=modelos, regras=regras)


def save_upload(uploaded_file, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        for chunk in uploaded_file.chunks():
            f.write(chunk)


def write_rules(dest: Path, normalized_text: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(normalized_text if normalized_text.endswith("\n") else normalized_text + "\n", encoding="utf-8")


# -------------------- BRADESCO --------------------
def _retarget_bradesco(job: JobPaths) -> None:
    import scripts.bradesco as bradesco

    # bradesco usa essas constantes :contentReference[oaicite:3]{index=3}
    bradesco.REPORT_DIR = job.base
    bradesco.MODELOS_DIR = job.modelos
    bradesco.REGRAS_DIR = job.regras

    bradesco.NEGOCIACAO_FILENAME = job.modelos / "RelNegociacao.xlsx"
    bradesco.REGRAS_FILENAME = job.regras / "Bradesco_regras.txt"


def run_bradesco(job: JobPaths) -> Path:
    _retarget_bradesco(job)
    import scripts.bradesco as bradesco
    return Path(bradesco.run())


# -------------------- TIM --------------------
def run_tim(job: JobPaths) -> Path:
    import scripts.tim as tim

    out_path, _, _ = tim.generate_report(
        modelo_path=str(job.modelos / "TIM_Modelo.xlsx"),
        relneg_path=str(job.modelos / "RelNegociacao.xlsx"),
        rules_path=str(job.regras / "Tim_regras.txt"),
        output_dir=str(job.base),
    )
    return Path(out_path)


# -------------------- CASAS BAHIA --------------------
def _retarget_casas_bahia(job: JobPaths) -> None:
    import scripts.casas_bahia_report as casas

    casas.BASE_DIR = job.base
    casas.REPORT_DIR = job.base
    casas.MODELOS_DIR = job.modelos
    casas.REGRAS_DIR = job.regras

    casas.INPUT_FILE = job.modelos / "RelNegociacao.xlsx"
    casas.RULES_FILE = job.regras / "Casas_Bahia_regras.txt"
    casas.SPEC_DEFAULT = job.modelos / "CASAS_BAHIA_SPEC.xlsx"


def run_casas_bahia(job: JobPaths) -> Path:
    _retarget_casas_bahia(job)
    import scripts.casas_bahia_report as casas
    out_path, _, _ = casas.generate_report()
    return Path(out_path)


# -------------------- DIVERSOS --------------------
def _retarget_diversos(job: JobPaths) -> None:
    import scripts.Diversos_RelReneg as diversos

    diversos.REPORT_DIR = str(job.base)
    diversos.MODELOS_DIR = str(job.modelos)
    diversos.REGRAS_DIR = str(job.regras)

    diversos.EXCEL_FILENAME = str(job.modelos / "RelNegociacao.xlsx")
    diversos.REGRAS_FILENAME = str(job.regras / "Diversos_Regras.txt")
    diversos.MODELO_FILENAME = str(job.modelos / "Report_RelReneg.xlsx")


def run_diversos(job: JobPaths) -> Path:
    _retarget_diversos(job)
    import scripts.Diversos_RelReneg as diversos

    regras = diversos.carregar_regras_flex(diversos.REGRAS_FILENAME)
    df = diversos.pd.read_excel(diversos.EXCEL_FILENAME, engine="openpyxl")
    summary, output_dir = diversos.gerar_reports_com_regras_flex(df, regras)

    if not summary:
        raise ValueError("Nenhum arquivo foi gerado para Diversos.")

    if len(summary) == 1:
        return Path(summary[0][2])

    # Caso múltiplos arquivos, empacota tudo em ZIP
    import zipfile

    zip_path = job.base / "Diversos_reports.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for _, _, path in summary:
            p = Path(path)
            if p.exists():
                zf.write(p, arcname=p.name)
    return zip_path


# -------------------- CLARO MERGE --------------------
def _retarget_claro(job: JobPaths) -> None:
    import scripts.claro_merge_report as claro_merge
    import scripts.claro_renovacao_report as renov
    import scripts.claro_distrato_report as distr

    # merge usa BASE_DIR :contentReference[oaicite:4]{index=4}
    claro_merge.BASE_DIR = job.base

    renov.BASE_DIR = job.base
    renov.MODELOS_DIR = job.modelos
    renov.REGRAS_DIR = job.regras
    renov.INPUT_FILE = job.modelos / "RelNegociacao.xlsx"
    renov.RULES_FILE = job.regras / "Claro_Renovacao_regras.txt"
    renov.REFERENCE_FILE = job.modelos / "CLARO_RENOV-Report-Invest.xlsx"

    distr.BASE_DIR = job.base
    distr.MODELOS_DIR = job.modelos
    distr.REGRAS_DIR = job.regras
    distr.INPUT_FILE = job.modelos / "RelNegociacao.xlsx"
    distr.RULES_FILE = job.regras / "Claro_Distrato_regras.txt"
    distr.REFERENCE_FILE = job.modelos / "CLARO_DISTRATO-Report-Invest.xlsx"


def run_claro_merge(job: JobPaths) -> Path:
    _retarget_claro(job)
    import scripts.claro_merge_report as claro_merge
    return Path(claro_merge.merge_reports())
