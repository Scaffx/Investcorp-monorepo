import re
from django.db import transaction


def normalize_numbers(raw: str, *, max_items: int = 10000, unique: bool = True) -> list[str]:
    nums = re.findall(r"\d+", raw or "")
    if not nums:
        return []

    if unique:
        seen = set()
        out = []
        for n in nums:
            if n not in seen:
                seen.add(n)
                out.append(n)
        nums = out

    if len(nums) > max_items:
        raise ValueError(f"Muitos itens: {len(nums)} (máx {max_items})")

    return nums


def normalize_rules_text(raw: str, *, max_items: int = 10000, unique: bool = True) -> list[str]:
    """
    Normaliza um texto de regras aceitando:
    - números por linha, separados por espaço, vírgula ou ponto-e-vírgula
    - linhas no formato "NSEQ_ESCOLHIDO:" (header)
    - linhas numeradas: "1 2594", "2 2898" (remove o índice)
    """
    nums: list[str] = []
    seen: set[str] = set()
    line_index = 0

    for raw_line in (raw or "").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if ":" in line:
            _, _, tail = line.partition(":")
            line = tail.strip()
            if not line:
                continue

        tokens = [token for token in re.split(r"[;,\\s]+", line) if token]
        if not tokens:
            continue

        line_index += 1
        if len(tokens) > 1 and tokens[0].isdigit() and tokens[0] == str(line_index):
            tokens = tokens[1:]

        for token in tokens:
            for match in re.findall(r"\d+", token):
                if unique and match in seen:
                    continue
                seen.add(match)
                nums.append(match)
                if len(nums) > max_items:
                    raise ValueError(f"Muitos itens: {len(nums)} (máx {max_items})")

    return nums


@transaction.atomic
def create_revision(rule_set, raw_text: str, user):
    from api.models_rules import RuleRevision  # import local evita circular

    nums = normalize_numbers(raw_text, max_items=10000, unique=True)
    if not nums:
        raise ValueError("Nenhum número válido foi encontrado.")

    normalized_text = "\n".join(nums) + "\n"

    rev = RuleRevision.objects.create(
        rule_set=rule_set,
        raw_text=raw_text,
        normalized_text=normalized_text,
        numbers_count=len(nums),
        created_by=user if getattr(user, "is_authenticated", False) else None,
    )

    rule_set.current_revision = rev
    rule_set.save(update_fields=["current_revision", "updated_at"])
    return rev
