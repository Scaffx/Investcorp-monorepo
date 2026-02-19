from __future__ import annotations

# Scraper VivaReal (n??cleo) - pronto para usar no Django (sem tkinter)

import json
import logging
import os
import random
import re
import time
import unicodedata
from typing import Optional, List, Dict, Callable
from urllib.parse import urlencode, quote_plus, urlparse, parse_qs
try:
    import requests
except ImportError:  # requests é opcional (usado só para geocoding)
    requests = None

import pandas as pd
from bs4 import BeautifulSoup, FeatureNotFound

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException

# webdriver_manager é opcional (em produção, prefira CHROMEDRIVER_PATH)
try:
    from webdriver_manager.chrome import ChromeDriverManager  # type: ignore
except Exception:  # pragma: no cover
    ChromeDriverManager = None  # type: ignore

# ---------------- CONSTANTES ----------------

HEADLESS_DEFAULT = True

ITEM_SELECTOR = (
    'li[data-cy="rp-property-cd"],'
    'div[data-cy$="cardProperty-content"],'
    'article[data-testid="property-card"],'
    'div[data-testid="property-card"],'
    'li[data-testid="property-card"]'
)

CARD_SELECTORS = [
    'li[data-cy="rp-property-cd"]',
    'div[data-cy$="cardProperty-content"]',
    'article[data-testid="property-card"]',
    'div[data-testid="property-card"]',
    'li[data-testid="property-card"]',
]

PROPERTY_SLUGS = {
    "Apartamento": "apartamento_residencial",
    "Casa": "casa_residencial",
    "Casa de Condomínio": "casa-de-condominio_residencial",
    "Cobertura": "cobertura_residencial",
    "Flat": "flat_residencial",
    "Kitnet/Conjugado": "kitnet-conjugado_residencial",
    "Lote/Terreno": "lote-terreno_residencial",
    "Sobrado": "sobrado_residencial",
    "Edifício Residencial": "edificio-residencial_residencial",
    "Fazenda/Sítios/Chácaras": "fazenda-sitios-chacaras_residencial",
    "Studio/Loft": "studio-loft_residencial",
    "Comercial": "comercial_comercial",
    "Consultório": "consultorio_comercial",
    "Galpão/Depósito/Armazém": "galpao-deposito-armazem_comercial",
    "Imóvel Comercial": "imovel-comercial_comercial",
    "Ponto Comercial/Loja/Box": "ponto-comercial-loja-box_comercial",
    "Sala/Conjunto": "sala-conjunto_comercial",
    "Prédio/Edifício Inteiro": "predio-edificio-inteiro_comercial",
    "Sala comercial": "sala-comercial_comercial",
}

SP_ZONA_OPTIONS = ["", "Norte", "Sul", "Leste", "Oeste", "Centro"]
RJ_ZONA_OPTIONS = ["", "Norte", "Sul", "Oeste", "Central"]

UF_FULL = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins",
}

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
STATUS_PREFIX = "[STATUS]"

def normalize_slug(text: str) -> str:
    """
    Normaliza texto para slug: remove acentos, deixa minúsculo e troca separadores por '-'.
    Ex: 'São Paulo' -> 'sao-paulo'
    """
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

UF_BY_SLUG = {normalize_slug(name): uf for uf, name in UF_FULL.items()}

STATE_URL_VARIANTS = {
    "sp": "sao-paulo",
    "sao-paulo": "sp",
    "rj": "rio-de-janeiro",
    "rio-de-janeiro": "rj",
}

def strip_accents_keep(text: str) -> str:
    """

    Remove acentos mantendo letras/números/espaços/hífen (para tokens do parâmetro 'onde').

    """
    normalized = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))
# Pequena pausa aleatória para simular timing humano em navegação/clicks

def human_pause(min_s: float = 0.6, max_s: float = 1.6):
    time.sleep(random.uniform(min_s, max_s))

def normalize_onde_token(text: str) -> str:
    """

    Normaliza texto do parametro 'onde' removendo acentos, espacos duplicados e forca minusculas.

    """
    cleaned = strip_accents_keep(text).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.lower()

def humanize_capitalize(text: str) -> str:
    """

    Capitaliza cada palavra (respeitando hifens) mantendo acentos para exibir na URL.

    """
    lowercase_words = {"da", "de", "do", "das", "dos"}
    parts = re.split(r"(\s+|-)", text or "")
    cap = []
    for part in parts:
        if not part or part.isspace() or part == "-":
            cap.append(part)
        else:
            lowered = part.lower()
            if lowered in lowercase_words:
                cap.append(lowered)
            else:
                cap.append(part[:1].upper() + part[1:].lower())
    return "".join(cap).strip()

def onde_display_token(text: str) -> str:
    """

    Normaliza apenas espaçamento para exibir no 'onde' mantendo acentos/capitalização.

    """
    cleaned = humanize_capitalize((text or "").strip())
    return re.sub(r"\s+", " ", cleaned)

def onde_trail_token(text: str) -> str:
    """

    Normaliza tokens do trail (BR>Estado>NULL>Cidade...) removendo acentos, mas preservando caixa.

    """
    cleaned = strip_accents_keep(humanize_capitalize(text)).strip()
    return re.sub(r"\s+", " ", cleaned)

def parse_positive_int(value: str) -> Optional[int]:
    """

    Converte texto que contenha dígitos em inteiro positivo (ex.: '300m2' -> 300).

    Retorna None se não conseguir converter.

    """
    if value is None:
        return None
    digits = re.sub(r"[^0-9]", "", str(value))
    if not digits:
        return None
    try:
        parsed = int(digits)
    except Exception:
        return None
    return parsed if parsed > 0 else None

def extrai_local_do_titulo(titulo: str) -> str:
    """

    Tenta extrair a parte do local a partir do título, cortando após 'em'.

    Exemplo: 'Casa ... emCampo Belo, São Paulo' -> 'Campo Belo, São Paulo'

    """
    if not titulo:
        return ""
    text = titulo.strip()
    if re.search(r"\b(Rua|Avenida|Av\.?|Alameda|Al\.|Travessa|Estrada|Estr\.|Rodovia|Rod\.|R\.)\b", text, re.IGNORECASE):
        if " - " in text:
            before, after = text.split(" - ", 1)
            if after.strip():
                return after.strip()
    m = re.search(r"\bem\s*(.+)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""

def extrai_numero_endereco(endereco: str) -> str:
    """

    Extrai o primeiro número de um endereço (ex.: 'Rua X, 1457 - ...' -> '1457').

    """
    if not endereco:
        return ""
    m = re.search(r"(\d+)", endereco)
    return m.group(1) if m else ""

def extrai_bairro_e_cidade(local: str) -> tuple[str, str]:
    if not local:
        return "", ""

    txt = re.sub(r"\s+", " ", str(local)).strip().replace("–", "-")
    if "imoveis" in strip_accents_keep(txt).lower():
        m = re.search(r"\bem\s+(.+)", txt, re.IGNORECASE)
        if m:
            txt = m.group(1).strip()

    # caso: "Bairro, Cidade - SP"
    if "," in txt:
        bairro, resto = txt.split(",", 1)
        cidade = resto.strip()
        cidade = re.sub(r"\s*-\s*[A-Z]{2}$", "", cidade).strip()
        return bairro.strip(), cidade

    # caso: "Bairro - Cidade - SP" ou "Bairro - Cidade"
    m = re.match(r"(.+?)\s*-\s*(.+?)(?:\s*-\s*[A-Z]{2})?$", txt)
    if m:
        return m.group(1).strip(), m.group(2).strip()

    return txt, ""

def clean_anunciante_text(text: str) -> str:
    """

    Normaliza o nome do anunciante corrigindo apóstrofos e espaços extras.

    """
    if not text:
        return ""
    cleaned = text.replace("\u00b4", "'")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"\bloja oficial\b", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"'([A-Z])", lambda m: "'" + m.group(1).lower(), cleaned)
    return cleaned
_uf_cache: Dict[str, str] = {}
_geocode_cache: Dict[str, tuple[str, str]] = {}

def _normalize_nome_cidade(nome: str) -> str:
    norm = unicodedata.normalize("NFKD", nome or "")
    ascii_text = "".join(ch for ch in norm if not unicodedata.combining(ch))
    return ascii_text.lower().strip()

def resolve_uf_por_cidade(nome_cidade: str, timeout: float = 4.0) -> str:
    """

    Tenta descobrir a UF via API pública do IBGE usando o nome da cidade.

    Retorna "" em caso de falha ou se requests não estiver disponível.

    """
    if not nome_cidade or not requests:
        return ""
    key = _normalize_nome_cidade(nome_cidade)
    if key in _uf_cache:
        return _uf_cache[key]
    try:
        resp = requests.get(
            "https://servicodados.ibge.gov.br/api/v1/localidades/municipios",
            params={"nome": nome_cidade},
            timeout=timeout,
        )
        if resp.ok:
            data = resp.json()
            for item in data:
                nome_api = _normalize_nome_cidade(item.get("nome", ""))
                if nome_api == key or key in nome_api:
                    uf = (
                        item.get("microrregiao", {})
                        .get("mesorregiao", {})
                        .get("UF", {})
                        .get("sigla", "")
                    )
                    uf = (uf or "").strip().upper()
                    _uf_cache[key] = uf
                    return uf
    except Exception:
        pass
    _uf_cache[key] = ""
    return ""

def geocode_location(city: str,
                     state: str = "",
                     region: str = "",
                     neighborhood: str = "",
                     street: str = "") -> tuple[str, str]:
    """

    Usa o Nominatim (OSM) para tentar obter lat/lon aproximados do endereço.

    Retorna tupla de strings vazias em caso de falha ou se requests não estiver disponível.

    """
    def clean(text: str) -> str:
        return (text or "").replace("-", " ").strip()
    city_c = clean(city)
    state_c = clean(state)
    region_c = clean(region)
    neighborhood_c = clean(neighborhood)
    street_c = clean(street)
    candidates = []
    # 1) street + neighborhood
    if street_c:
        candidates.append([street_c, neighborhood_c or region_c, city_c, state_c, "Brasil"])
    # 2) neighborhood + city
    if neighborhood_c:
        candidates.append([neighborhood_c, city_c, state_c, "Brasil"])
    # 3) region + city
    if region_c:
        candidates.append([region_c, city_c, state_c, "Brasil"])
    # 4) fallback city + state
    candidates.append([city_c, state_c, "Brasil"])
    def try_query(query: str) -> Optional[tuple[str, str]]:
        cache_key = query.lower()
        if cache_key in _geocode_cache:
            return _geocode_cache[cache_key]
        params = {
            "q": query,
            "format": "json",
            "limit": 1,
            "countrycodes": "br",
        }
        headers = {"User-Agent": "vivareal-script/1.0"}
        def extract_lat_lon(data):
            if not data:
                return None
            try:
                lat = data[0].get("lat", "")
                lon = data[0].get("lon", "")
                if lat and lon:
                    lat_s = f"{float(lat):.6f}"
                    lon_s = f"{float(lon):.6f}"
                    _geocode_cache[cache_key] = (lat_s, lon_s)
                    return lat_s, lon_s
            except Exception:
                return None
            return None
        try:
            if requests:
                resp = requests.get(
                    "https://nominatim.openstreetmap.org/search",
                    params=params,
                    headers=headers,
                    timeout=6,
                )
                if resp.ok:
                    result = extract_lat_lon(resp.json())
                    if result:
                        return result
            else:
                from urllib.request import Request, urlopen
                url = "https://nominatim.openstreetmap.org/search?" + urlencode(params)
                req = Request(url, headers=headers)
                with urlopen(req, timeout=6) as resp:
                    raw = resp.read()
                result = extract_lat_lon(json.loads(raw.decode("utf-8")))
                if result:
                    return result
        except Exception:
            pass
        _geocode_cache[cache_key] = ("", "")
        return None
    for parts in candidates:
        query = ", ".join([p for p in parts if p])
        if not query:
            continue
        result = try_query(query)
        if result:
            return result
    return "", ""

def normalize_zona_title(region_title: str, uf_upper: str, state_norm: str) -> str:
    if not region_title:
        return ""
    title = region_title.strip()
    if not title:
        return ""
    title_lower = strip_accents_keep(title).lower()
    is_sp = uf_upper == "SP" or "sao-paulo" in state_norm
    is_rj = uf_upper == "RJ" or "rio-de-janeiro" in state_norm
    if not (is_sp or is_rj):
        return title
    if title_lower.startswith("zona "):
        return title
    if title_lower in ("norte", "sul", "leste", "oeste"):
        return f"Zona {title}"
    if is_sp and title_lower == "centro":
        return "Centro"
    if is_rj and title_lower == "central":
        return "Central"
    return title


def is_zone_like(value: str) -> bool:
    slug = normalize_slug(value or "")
    if not slug:
        return False
    if slug.startswith("zona-"):
        return True
    return slug in ("norte", "sul", "leste", "oeste", "centro", "central")


def zone_label(value: str) -> str:
    slug = normalize_slug(value or "")
    if not slug:
        return ""
    if slug.startswith("zona-"):
        suffix = slug[len("zona-") :].replace("-", " ").strip()
        return f"Zona {suffix.title()}" if suffix else ""
    if slug in ("norte", "sul", "leste", "oeste"):
        return f"Zona {slug.title()}"
    if slug == "centro":
        return "Centro"
    if slug == "central":
        return "Central"
    return ""

def build_url_from_filters(operation: str,
                           state: str,
                           city: str,
                           region: str,
                           neighborhood: str,
                           property_label: str,
                           bedrooms: str = "",
                           bathrooms: str = "",
                           area_min: str = "",
                           area_max: str = "",
                           street: str = "") -> str:
    """

    Monta a URL do VivaReal usando filtros básicos preenchidos pelo usuário.

    """
    op = (operation or "venda").strip().lower()
    if op not in ("venda", "aluguel"):
        op = "venda"
    state_title = state.strip()
    if not state_title:
        raise ValueError("Preencha o campo Estado.")
    state_norm = normalize_slug(state_title)
    uf_upper = state_title.upper()
    is_uf = len(uf_upper) == 2 and uf_upper in UF_FULL
    if uf_upper == "SP" or "sao-paulo" in state_norm:
        state_slug = "sp"
    elif uf_upper == "RJ" or "rio-de-janeiro" in state_norm:
        state_slug = "rj"
    elif is_uf:
        state_slug = normalize_slug(UF_FULL[uf_upper])
    else:
        state_slug = state_norm
    city_title = (city or "").strip()
    city_slug = normalize_slug(city_title)
    has_city = bool(city_slug)
    property_label = (property_label or "").strip()
    property_slug = ""
    if property_label:
        property_slug = PROPERTY_SLUGS.get(property_label)
        if not property_slug:
            label_norm = strip_accents_keep(property_label).lower()
            for key, slug in PROPERTY_SLUGS.items():
                if strip_accents_keep(key).lower() == label_norm:
                    property_slug = slug
                    break
        if not property_slug:
            candidate = normalize_slug(property_label)
            for slug in PROPERTY_SLUGS.values():
                slug_dash = slug.replace("_", "-")
                if slug_dash == candidate or slug_dash.startswith(candidate + "-"):
                    property_slug = slug
                    break
    if not property_slug:
        property_slug = PROPERTY_SLUGS["Apartamento"]
    params = []
    q = parse_positive_int(bedrooms)
    if q:
        params.append(("quartos", q))
    b = parse_positive_int(bathrooms)
    if b:
        params.append(("banheiros", b))
    area_min_num = parse_positive_int(area_min)
    area_max_num = parse_positive_int(area_max)
    if area_min_num:
        params.append(("areaMinima", area_min_num))
    if area_max_num and (not area_min_num or area_max_num >= area_min_num):
        params.append(("areaMaxima", area_max_num))
    street_kw = (street or "").strip()
    street_slug = normalize_slug(street_kw)
    has_street = bool(street_kw)
    use_street_path = bool(street_slug)
    if has_street and not use_street_path:
        params.append(("palavras-chave", street_kw))
    region_title = normalize_zona_title(region.strip(), uf_upper, state_norm)
    neighborhood_title = neighborhood.strip()
    if not has_city and (region_title or neighborhood_title or street_kw):
        raise ValueError("Preencha o campo Cidade para usar Zona, Bairro ou Logradouro.")
    region_slug = normalize_slug(region_title)
    region_is_zone = region_slug.startswith("zona-") or region_slug in ("centro", "central")
    is_zone_state = (
        uf_upper in ("SP", "RJ")
        or "sao-paulo" in state_norm
        or "rio-de-janeiro" in state_norm
    )
    neighborhood_slug = normalize_slug(neighborhood)
    path_parts = [op, state_slug]
    if has_city:
        path_parts.append(city_slug)
        if region_slug:
            if region_is_zone:
                if is_zone_state:
                    path_parts.append(region_slug)
            else:
                path_parts.append(region_slug)
        if neighborhood_slug:
            if not (region_is_zone and is_zone_state):
                if not region_slug or region_is_zone:
                    path_parts.append("bairros")
            path_parts.append(neighborhood_slug)
        if use_street_path:
            path_parts.append(street_slug)
    path_parts.append(property_slug)
    # Mantem a URL enxuta para evitar divergencias de resultado entre site e scraper.
    # O filtro principal fica no caminho (.../estado/cidade/regiao/tipo/).
    encoded_parts = []
    for k, v in params:
        encoded_parts.append(f"{k}={quote_plus(str(v), safe='')}")
    query = "&".join(encoded_parts)
    path = "/".join(path_parts)
    return f"https://www.vivareal.com.br/{path}/?{query}"

def _filters_from_url(url: str) -> Optional[dict]:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    if "vivareal.com.br" not in parsed.netloc:
        return None

    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 4:
        return None

    operacao = parts[0]
    estado = parts[1]
    cidade = parts[2]
    tipo_imovel = parts[-1]
    middle = parts[3:-1]

    region_path = ""
    bairro_path = ""
    if middle:
        if "bairros" in middle:
            idx = middle.index("bairros")
            if idx > 0:
                region_path = middle[0]
            if idx + 1 < len(middle):
                bairro_path = middle[idx + 1]
        else:
            region_path = middle[0]

    qs = parse_qs(parsed.query)

    def qv(*names: str) -> str:
        for name in names:
            values = qs.get(name)
            if values:
                return values[0]
        return ""

    return {
        "operacao": operacao,
        "estado": estado,
        "cidade": cidade,
        "tipo_imovel": tipo_imovel,
        "regiao": qv("regiao", "zona", "region") or region_path,
        "bairro": qv("bairro", "neighborhood") or bairro_path,
        "quartos": qv("quartos", "bedrooms"),
        "banheiros": qv("banheiros", "bathrooms"),
        "area_min": qv("area_min", "areaMin", "areaMinima"),
        "area_max": qv("area_max", "areaMax", "areaMaxima"),
        "logradouro": qv("logradouro", "rua", "street", "palavras-chave", "palavras_chave"),
    }


def selected_zone_from_url(url: str) -> str:
    filters = _filters_from_url(url)
    if not filters:
        return ""
    return zone_label(filters.get("regiao", ""))

def normalize_vivareal_url(url: str) -> str:
    """
    Normaliza uma URL do VivaReal. Se houver regiao/bairro nos filtros, garante
    que aparecam na parte do caminho (ex.: /zona-sul/).
    """
    filters = _filters_from_url(url)
    if not filters:
        return url
    try:
        return build_url_from_filters(
            filters.get("operacao", "venda"),
            filters.get("estado", ""),
            filters.get("cidade", ""),
            filters.get("regiao", ""),
            filters.get("bairro", ""),
            filters.get("tipo_imovel", "Apartamento"),
            filters.get("quartos", ""),
            filters.get("banheiros", ""),
            filters.get("area_min", ""),
            filters.get("area_max", ""),
            filters.get("logradouro", ""),
        )
    except Exception:
        return url

def build_state_url_variants(url: str) -> List[str]:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return []
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        return []
    state_part = parts[1]
    variants = []
    alt_state = STATE_URL_VARIANTS.get(state_part)
    if alt_state and alt_state != state_part:
        parts_alt = parts.copy()
        parts_alt[1] = alt_state
        new_path = "/" + "/".join(parts_alt) + "/"
        variants.append(parsed._replace(path=new_path).geturl())
    return variants

def _zone_slug_from_onde(query: str) -> str:
    qs = parse_qs(query)
    onde_val = qs.get("onde", [""])[0]
    if not onde_val:
        return ""
    parts = onde_val.split(",")
    if len(parts) < 4:
        return ""
    region_token = parts[3].strip()
    if not region_token:
        return ""
    return normalize_slug(region_token)

def build_zone_bairro_url_variants(url: str) -> List[str]:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return []
    zone_slug = _zone_slug_from_onde(parsed.query)
    if not zone_slug:
        return []
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 3:
        return []
    variants = []
    def add_variant(parts_alt: List[str]):
        new_path = "/" + "/".join(parts_alt) + "/"
        variants.append(parsed._replace(path=new_path).geturl())

    def toggle_bairros(parts_list: List[str]):
        if zone_slug not in parts_list:
            return
        zone_idx = parts_list.index(zone_slug)
        if zone_idx + 1 >= len(parts_list) - 1:
            return
        if "bairros" in parts_list[zone_idx + 1:-1]:
            idx = parts_list.index("bairros", zone_idx + 1)
            if idx == zone_idx + 1 and idx + 1 < len(parts_list) - 1:
                parts_alt = parts_list.copy()
                parts_alt.pop(idx)
                add_variant(parts_alt)
        else:
            parts_alt = parts_list.copy()
            parts_alt.insert(zone_idx + 1, "bairros")
            add_variant(parts_alt)

    if zone_slug in parts:
        parts_no_zone = parts.copy()
        parts_no_zone.remove(zone_slug)
        add_variant(parts_no_zone)
        toggle_bairros(parts)
    else:
        parts_with_zone = parts.copy()
        parts_with_zone.insert(3, zone_slug)
        add_variant(parts_with_zone)
        toggle_bairros(parts_with_zone)
    return list(dict.fromkeys(variants))

def preco_format(preco_str: Optional[str]) -> float:
    """

    Converte strings como 'R$ 1.200.000' ou '1.200.000,50' para float.

    Retorna 0.0 se não conseguir converter.

    """
    if preco_str is None:
        return 0.0
    if isinstance(preco_str, (int, float)):
        try:
            return float(preco_str)
        except Exception:
            return 0.0
    s = str(preco_str).strip()
    if not s:
        return 0.0
    s = s.replace("R$", "").strip()
    s = re.sub(r"[^\d\.,]", "", s)
    if s.count(",") >= 1 and s.count(".") >= 1:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(",") >= 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return 0.0

def area_to_float(area_str: Optional[str]) -> float:
    """

    Converte área como '75 m²' ou '75,5 m²' para float (em m²).

    Retorna 0.0 se inválido.

    """
    if not area_str:
        return 0.0
    s = str(area_str).lower().replace("m²", "").replace("m2", "").replace("m", "")
    s = s.strip()
    s = re.sub(r"[^\d\.,]", "", s)
    if not s:
        return 0.0
    if s.count(",") >= 1 and s.count(".") >= 1:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(",") >= 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return 0.0

def build_soup(html: str) -> BeautifulSoup:
    """

    Cria o BeautifulSoup usando lxml quando disponível.

    Faz fallback para o parser nativo se lxml não estiver instalado.

    """
    try:
        return BeautifulSoup(html, "lxml")
    except FeatureNotFound:
        logging.warning("Parser 'lxml' não encontrado. Usando 'html.parser'.")
        return BeautifulSoup(html, "html.parser")

def driver_setup(headless: bool = HEADLESS_DEFAULT, user_agent: Optional[str] = None) -> webdriver.Chrome:
    """
    Cria e retorna um Chrome WebDriver configurado.

    Produção (recomendado):
      - Instale o chromedriver no container/servidor e aponte via env CHROMEDRIVER_PATH.

    Desenvolvimento:
      - Se webdriver_manager estiver disponível, ele baixa o driver automaticamente.
    """
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")

    # flags recomendadas em servidor/container
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")

    opts.add_argument("--window-size=1280,1024")
    opts.add_argument("--lang=pt-BR")
    opts.add_experimental_option("prefs", {"intl.accept_languages": "pt-BR,pt"})
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--start-maximized")

    # Desativa logs de automação
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)

    if user_agent:
        opts.add_argument(f"user-agent={user_agent}")

    chromedriver_path = os.getenv("CHROMEDRIVER_PATH", "").strip()
    if chromedriver_path:
        service = Service(chromedriver_path)
    else:
        if ChromeDriverManager is None:
            raise RuntimeError(
                "CHROMEDRIVER_PATH não definido e webdriver_manager indisponível. "
                "Instale chromedriver e exporte CHROMEDRIVER_PATH."
            )
        service = Service(ChromeDriverManager().install())

    driver = webdriver.Chrome(service=service, options=opts)

    # Disfarça o webdriver para reduzir bloqueios simples (ex.: Cloudflare)
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"},
        )
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": """
                Object.defineProperty(navigator, 'languages', {get: () => ['pt-BR', 'pt', 'en-US']});
                Object.defineProperty(navigator, 'platform', {get: () => 'Win32'});
                Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 4});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4]});
            """},
        )
    except Exception:
        pass

    return driver

def scroll_enquanto_sem_novos_itens(driver, item_css, cancel_cb=None,
                                   max_cycles=80, pause=1.0, log_cb=None):
    """
    Scrolla a página até não aparecerem novos itens ou até max_cycles.

    cancel_cb: função que retorna True se o job foi cancelado (opcional).
    log_cb: função de callback para logs.
    """
    prev_count = 0

    def canceled() -> bool:
        try:
            return bool(cancel_cb()) if cancel_cb else False
        except Exception:
            return False

    for cycle in range(max_cycles):
        if canceled():
            if log_cb:
                log_cb("Interrompido pelo usuário durante o scroll.")
            break

        # Scroll mais "humano": pequenos saltos em vez de ir direto ao fim
        total_steps = random.randint(3, 6)
        for _ in range(total_steps):
            if canceled():
                break
            driver.execute_script(
                "window.scrollBy(0, Math.max(300, document.documentElement.clientHeight * 0.35));"
            )
            time.sleep(0.25 + random.uniform(0.05, 0.35))

        try:
            WebDriverWait(driver, 8).until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, item_css))
            )
        except TimeoutException:
            if log_cb:
                log_cb("Aguardando carregamento dos anúncios (pode demorar)...")

        time.sleep(pause + random.uniform(0.4, 1.0))
        items = driver.find_elements(By.CSS_SELECTOR, item_css)
        count = len(items)

        if log_cb:
            log_cb(f"Ciclo {cycle+1}/{max_cycles} — anúncios encontrados: {count}")

        # Se não encontrou anúncios novos comparado ao ciclo anterior, para imediatamente
        if count == prev_count:
            if log_cb:
                log_cb("Nenhum anúncio novo encontrado — parando scroll.")
            break
        prev_count = count

    return prev_count

def collect_cards(soup: BeautifulSoup) -> list:
    cards = []
    seen = set()
    for selector in CARD_SELECTORS:
        for card in soup.select(selector):
            if id(card) in seen:
                continue
            seen.add(id(card))
            cards.append(card)
    if cards:
        return cards
    for price_elem in soup.select('[data-cy="rp-cardProperty-price-txt"]'):
        card = price_elem.find_parent(attrs={"data-cy": re.compile(r"cardProperty", re.IGNORECASE)})
        if not card:
            card = price_elem.find_parent(["li", "article", "div"])
        if card and id(card) not in seen:
            seen.add(id(card))
            cards.append(card)
    return cards

def extrai_anuncios_do_soup(soup: BeautifulSoup, log_cb=None) -> list:
    """
    Extrai os dados dos cards do BeautifulSoup.
    Retorna lista de dicionários.
    """
    cards = collect_cards(soup)
    if log_cb:
        log_cb(f"🔎 {len(cards)} cards de imóvel encontrados.")

    dados: List[Dict] = []
    vistos = set()
    header_local = ""
    header_bairro = ""
    header_cidade = ""
    header_node = soup.select_one("#mobile-result-scroll-point h1")
    if header_node:
        header_text = header_node.get_text(" ", strip=True)
        header_local_raw = extrai_local_do_titulo(header_text) or header_text
        header_bairro, header_cidade = extrai_bairro_e_cidade(header_local_raw)
        if header_bairro and header_cidade:
            header_local = f"{header_bairro}, {header_cidade}"
        elif header_bairro:
            header_local = header_bairro
        elif header_cidade:
            header_local = header_cidade

    for idx, card in enumerate(cards, start=1):
        try:
            if log_cb:
                log_cb(f"Processando card {idx}/{len(cards)}...")

            # ========= STRINGS DO CARD (base para fallbacks) =========
            strings = [t.strip() for t in card.stripped_strings if t.strip()]
            blob = " ".join(strings)

            # ========= LINK =========
            link = ""
            link_elem = card.select_one("a[href]") or card.find("a")
            if not link_elem and card.name == "a" and card.get("href"):
                link_elem = card
            if not link_elem:
                link_elem = card.find_parent("a", href=True)

            if link_elem:
                href = link_elem.get("href") or ""
                if href:
                    link = href if isinstance(href, str) and href.startswith("http") else f"https://www.vivareal.com.br{href}"

            if link and "source=showcase" in link:
                continue

            # ========= IMAGEM (capa do anuncio) =========
            image_url = ""
            for img in card.find_all("img"):
                src = ""
                for attr in ("src", "data-src", "data-lazy-src", "data-original"):
                    candidate = img.get(attr)
                    if isinstance(candidate, str) and candidate.strip():
                        src = candidate.strip()
                        break
                if not src:
                    srcset = img.get("srcset") or img.get("data-srcset") or ""
                    if isinstance(srcset, str) and srcset.strip():
                        src = srcset.split(",")[0].strip().split(" ")[0].strip()
                if not src:
                    continue
                low_src = src.lower()
                if low_src.startswith("data:image") or "placeholder" in low_src:
                    continue
                if src.startswith("//"):
                    src = f"https:{src}"
                elif src.startswith("/"):
                    src = f"https://www.vivareal.com.br{src}"
                if src.startswith("http"):
                    image_url = src
                    break

            # ========= TÍTULO =========
            titulo_elem = card.select_one("h2") or card.select_one(".title") or card.find("h3")
            titulo = titulo_elem.get_text(strip=True) if titulo_elem else ""

            # ========= LOCAL / RUA (primeiro tenta seletor; depois fallback) =========
            local_elem = (
                card.find("h2", {"data-cy": "rp-cardProperty-location-txt"})
                or card.find("span", {"data-cy": "rp-cardProperty-location-txt"})
            )
            rua_elem = card.find("p", {"data-cy": "rp-cardProperty-street-txt"})

            local = local_elem.get_text(strip=True) if local_elem else ""
            rua = rua_elem.get_text(strip=True) if rua_elem else ""

            # fallback local pelo título: ".... em Bairro, Cidade"
            if (not local) or local == titulo:
                from_title = extrai_local_do_titulo(titulo)
                if from_title:
                    local = from_title

            # ---------- LOCAL (fallback robusto pelo texto do card) ----------
            if not local:
                for s in strings:
                    # pega algo com vírgula tipo "Moema, São Paulo" e ignora preço/área
                    if ("," in s) and ("R$" not in s) and ("m²" not in s) and (len(s) <= 80):
                        local = s
                        break
            if header_bairro and header_cidade:
                local_norm = strip_accents_keep(local).lower()
                header_bairro_norm = strip_accents_keep(header_bairro).lower()
                header_is_zone = is_zone_like(header_bairro)
                # Se o header for apenas zona (ex.: "Zona Sul"), não sobrescreve o bairro
                # do card; ele será anexado depois no formato "Bairro + Zona".
                if not local:
                    local = header_local
                elif (not header_is_zone) and header_bairro_norm not in local_norm:
                    local = header_local
            elif header_local and (not local or ("," in header_local and "," not in local)):
                local = header_local

            # ---------- RUA (fallback por palavras-chave) ----------
            if not rua:
                for s in strings:
                    if re.search(r"\b(Rua|Avenida|Av\.?|Alameda|Al\.|Travessa|Estrada|Estr\.|Rodovia|Rod\.|R\.)\b", s, re.I):
                        if ("R$" not in s) and ("m²" not in s):
                            rua = s
                            break
            if not rua:
                for p in card.find_all("p"):
                    candidate = p.get_text(" ", strip=True)
                    if not candidate:
                        continue
                    if "R$" in candidate or "m²" in candidate:
                        continue
                    if re.search(r"\d", candidate) and "," in candidate:
                        rua = candidate
                        break

            # ---------- NÚMERO (se vier na rua) ----------
            numero = extrai_numero_endereco(rua)

            # ========= PREÇO (texto) =========
            preco_elem = card.select_one(
                "p[data-cy='rp-cardProperty-price-txt'],"
                "span[data-cy='rp-cardProperty-price-txt'],"
                "div[data-cy='rp-cardProperty-price-txt'],"
                "p.text-2-25.text-neutral-120.font-semibold,"
                "p.text-2-5.text-neutral-120.font-semibold,"
                "p[class*='text-2-25'][class*='text-neutral-120'][class*='font-semibold'],"
                "p[class*='text-2-5'][class*='text-neutral-120'][class*='font-semibold'],"
                "span[class*='text-2-25'][class*='text-neutral-120'][class*='font-semibold'],"
                "span[class*='text-2-5'][class*='text-neutral-120'][class*='font-semibold'],"
                "div[class*='text-2-25'][class*='text-neutral-120'][class*='font-semibold'],"
                "div[class*='text-2-5'][class*='text-neutral-120'][class*='font-semibold'],"
                "p[class*='preco'],"
                ".preco,"
                ".preco-cartao,"
                ".property-card__price,"
                ".property-card__price-value"
            )

            preco_text = preco_elem.get_text(" ", strip=True) if preco_elem else ""
            if not preco_text:
                for s in strings:
                    if re.search(r"R\$\s*\d", s):
                        preco_text = s
                        break
                if not preco_text:
                    for i, s in enumerate(strings):
                        if "R$" in s:
                            if re.search(r"\d", s):
                                preco_text = s
                            elif i + 1 < len(strings) and re.search(r"\d", strings[i + 1]):
                                preco_text = f"{s} {strings[i + 1]}"
                            break

            # ========= ÁREA =========
            area_text = ""
            area_li = card.select_one(
                "li[data-cy='rp-cardProperty-propertyArea-txt'],"
                "li[data-cy*='propertyArea']"
            )
            if area_li:
                area_h3 = area_li.find("h3")
                if area_h3:
                    area_text = area_h3.get_text(" ", strip=True)
                else:
                    area_text = area_li.get_text(" ", strip=True)

            if not area_text:
                area_svg = card.find("svg", {"aria-label": re.compile(r"Tamanho do im", re.IGNORECASE)})
                if area_svg:
                    area_li2 = area_svg.find_parent("li")
                    if area_li2:
                        area_h3 = area_li2.find("h3")
                        if area_h3:
                            area_text = area_h3.get_text(" ", strip=True)
                        else:
                            area_text = area_li2.get_text(" ", strip=True)

            if not area_text:
                for s in strings:
                    if re.search(r"\d[\d\.,]*\s*m\s*(?:²|2)", s, re.IGNORECASE):
                        area_text = s
                        break

            if area_text:
                area_norm = strip_accents_keep(area_text)
                area_norm = area_norm.replace("²", "2")
                area_norm = re.sub(r"^\s*Tamanho do imovel\s*", "", area_norm, flags=re.IGNORECASE).strip()
                match = re.search(r"\d[\d\.,]*\s*m\s*2", area_norm, re.IGNORECASE)
                if match:
                    area_text = match.group(0)
                else:
                    area_text = area_norm
                area_text = re.sub(r"m\s*2", "m²", area_text, flags=re.IGNORECASE)

            area = area_text.strip() if area_text else ""

            # ========= QUARTOS / BANHEIROS / VAGAS (robusto) =========
            def pick_qty(cy: str) -> str:
                el = card.select_one(f"li[data-cy='{cy}']") or card.select_one(f"[data-cy='{cy}']")
                if not el:
                    return ""
                txt = el.get_text(" ", strip=True)
                m = re.search(r"(\d+)", txt)
                return m.group(1) if m else ""

            quartos = pick_qty("rp-cardProperty-bedroomQuantity-txt")
            banheiros = pick_qty("rp-cardProperty-bathroomQuantity-txt")
            vagas = pick_qty("rp-cardProperty-parkingSpacesQuantity-txt")

            # fallback por regex (para layouts diferentes quando Zona/Bairro muda)
            if not quartos:
                m = re.search(r"\b(\d+)\s*(quartos?|dormit[óo]rios?)\b", blob, re.I)
                if m:
                    quartos = m.group(1)

            if not banheiros:
                m = re.search(r"\b(\d+)\s*banheir", blob, re.I)
                if m:
                    banheiros = m.group(1)

            if not vagas:
                m = re.search(r"\b(\d+)\s*vagas?\b", blob, re.I)
                if m:
                    vagas = m.group(1)

            if not quartos or not banheiros or not vagas:
                def parse_qty(text: str) -> str:
                    m = re.search(r"(\d+)", text)
                    return m.group(1) if m else ""

                candidate = None
                for ul in card.find_all("ul"):
                    lis = ul.find_all("li", recursive=False)
                    if len(lis) < 3:
                        continue
                    texts = [li.get_text(" ", strip=True) for li in lis]
                    if not any(re.search(r"\d", t) for t in texts):
                        continue
                    if any("R$" in t for t in texts):
                        continue
                    candidate = texts
                    if len(lis) >= 4:
                        break
                if candidate:
                    offset = 1 if (len(candidate) >= 4 or re.search(r"m\s*2|m²", candidate[0], re.I)) else 0
                    if not quartos and len(candidate) > offset:
                        quartos = parse_qty(candidate[offset])
                    if not banheiros and len(candidate) > offset + 1:
                        banheiros = parse_qty(candidate[offset + 1])
                    if not vagas and len(candidate) > offset + 2:
                        vagas = parse_qty(candidate[offset + 2])

            # ========= CONDOMÍNIO / IPTU =========
            cond_ip_elem = card.select_one(
                "p.text-1-75.text-neutral-110.overflow-hidden.text-ellipsis, "
                "p[class*='cond-iptu'], .cond, .cond-cartao, .iptu, .cond-iptu"
            )
            condominio = ""
            iptu = ""
            if cond_ip_elem:
                raw_parts = [p.strip() for p in cond_ip_elem.get_text("•").split("•") if p.strip()]
                for part in raw_parts:
                    low = part.lower()
                    if "cond" in low:
                        condominio = part.replace("Cond.", "").replace("Condomínio", "").strip()
                    elif "iptu" in low:
                        iptu = part.replace("IPTU", "").strip()
                if not condominio and not iptu and raw_parts:
                    condominio = raw_parts[0]

            if log_cb and (not preco_text or not area):
                debug_strings = " | ".join(strings[:10])
                if len(debug_strings) > 200:
                    debug_strings = debug_strings[:200] + "..."
                log_cb(
                    f"DEBUG preco/area card {idx}: preco='{preco_text}' area='{area}' "
                    f"titulo='{titulo[:60]}' strings='{debug_strings}'"
                )

            data = {
                "Link": link,
                "Título": titulo,
                "Imagem URL": image_url,
                "Local": local,
                "Rua": rua,
                "Número": numero,
                "Preço": preco_text,
                "Área": area,
                "Quartos": quartos,
                "Banheiros": banheiros,
                "Vagas": vagas,
                "Condomínio": condominio,
                "IPTU": iptu
            }

            key = link or f"{titulo}|{local}|{rua}"
            if key in vistos:
                if log_cb:
                    log_cb("Duplicado detectado — pulando.")
                continue
            vistos.add(key)
            dados.append(data)

        except Exception as e:
            if log_cb:
                log_cb(f"Erro ao processar card: {e}")

    return dados
# ---------------- SALVAMENTO DE ARQUIVOS ----------------

def try_accept_cookies(driver, log_cb=None):
    """

    Tenta clicar em botões comuns de cookie/consent para liberar a visualização.

    """
    try:
        buttons = driver.find_elements(By.TAG_NAME, "button")
        for b in buttons:
            try:
                text = (b.text or "").strip().lower()
                if any(k in text for k in ["aceitar", "concordo", "permitir", "accept", "agree", "fechar", "fechar janela"]):
                    if log_cb:
                        log_cb(f"Tentando clicar no botão de cookie: '{text[:30]}'")
                    try:
                        b.click()
                        time.sleep(0.6)
                    except Exception:
                        pass
            except Exception:
                continue
    except Exception:
        if log_cb:
            log_cb("Busca de botões de cookies falhou (seguindo em frente).")

def is_cloudflare_block(html: str) -> bool:
    """

    Detecta páginas de bloqueio (Cloudflare/anti-bot) para decidir retry visível.

    """
    if not html:
        return False
    low = html.lower()
    tokens = [
        "cf-error-details",
        "attention required",
        "sorry, you have been blocked",
        "/cdn-cgi/challenge-platform",
        "cloudflare ray id",
        "you are unable to access",
    ]
    return any(tok in low for tok in tokens)

# ---------------- WORKER (executa scraping) ----------------

# ---------------- RUNNER (sem tkinter) ----------------

LogCallback = Optional[Callable[[str], None]]
CancelCallback = Optional[Callable[[], bool]]

def run_scrape(
    url: str,
    *,
    headless: bool = True,
    retry_visible: bool = True,
    use_headless_ua: bool = True,
    property_label: str = "",
    selected_uf: str = "",
    log_cb: LogCallback = None,
    cancel_cb: CancelCallback = None,
) -> pd.DataFrame:
    """
    Executa o scraping e retorna o DataFrame FINAL (no layout que você já usa no XLSX),
    SEM salvar arquivo automaticamente e SEM enviar para banco.

    - log_cb(msg): recebe mensagens de log (para salvar em JobLog, console, etc.)
    - cancel_cb(): deve retornar True se o job foi cancelado.
    """

    def _log(msg: str):
        if log_cb:
            if not msg.startswith(STATUS_PREFIX):
                msg = f"{STATUS_PREFIX} {msg}"
            log_cb(msg)
        else:
            logging.info(msg)

    def _status(msg: str):
        _log(msg)

    def _canceled() -> bool:
        try:
            return bool(cancel_cb()) if cancel_cb else False
        except Exception:
            return False

    driver = None
    try:
        _status("Buscando imoveis")

        normalized_url = normalize_vivareal_url(url)
        if normalized_url != url:
            _log(f"URL normalizada: {normalized_url}")
            url = normalized_url
        selected_zone = selected_zone_from_url(url)

        ua = None
        if headless and use_headless_ua:
            ua = (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )

        driver = driver_setup(headless=headless, user_agent=ua)

        def fetch_rows(target_url: str) -> tuple[list[dict], str]:
            if _canceled():
                return [], ""
            driver.get(target_url)
            human_pause(1.0, 2.4)

            _status("Aguardando carregamento")
            WebDriverWait(driver, 15).until(EC.visibility_of_all_elements_located((By.TAG_NAME, "body")))

            _status("Aceitando cookies")
            try_accept_cookies(driver, log_cb=_log)

            _status("Carregando anuncios")
            scroll_enquanto_sem_novos_itens(driver, ITEM_SELECTOR, cancel_cb, log_cb=_log)

            if _canceled():
                return [], ""

            try:
                WebDriverWait(driver, 10).until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, ITEM_SELECTOR)))
            except TimeoutException:
                _log("Atenção: não foram detectados cards depois do scroll (página vazia ou bloqueio).")

            html = driver.page_source
            soup = build_soup(html)
            rows = extrai_anuncios_do_soup(soup, log_cb=_log)

            _status("Processando resultados")
            return rows, html

        rows, html = fetch_rows(url)

        # tenta alternativas de zona/bairro e de estado
        if not _canceled() and len(rows) == 0 and not is_cloudflare_block(html):
            for alt_url in build_zone_bairro_url_variants(url):
                _status("Tentando alternativa de zona/bairro")
                rows, html = fetch_rows(alt_url)
                if _canceled():
                    break
                if len(rows) > 0:
                    url = alt_url
                    break

        if not _canceled() and len(rows) == 0 and not is_cloudflare_block(html):
            for alt_url in build_state_url_variants(url):
                _status("Tentando alternativa de estado")
                rows, html = fetch_rows(alt_url)
                if _canceled():
                    break
                if len(rows) > 0:
                    url = alt_url
                    break

        # se headless não achou nada, tenta modo visível (opcional)
        if not _canceled() and headless and retry_visible and len(rows) == 0:
            _log("Nenhum card encontrado no modo headless.")
            if is_cloudflare_block(html):
                _log("Possível bloqueio (Cloudflare) detectado.")
            try:
                driver.quit()
            except Exception:
                pass
            _status("Tentando novamente (modo visível)")
            return run_scrape(
                url,
                headless=False,
                retry_visible=False,
                use_headless_ua=use_headless_ua,
                property_label=property_label,
                selected_uf=selected_uf,
                log_cb=log_cb,
                cancel_cb=cancel_cb,
            )

        if _canceled():
            raise RuntimeError("Cancelado pelo usuário.")

        if len(rows) == 0:
            # devolve DF vazio (front mostra “0 resultados”)
            return pd.DataFrame()

        # Normaliza chaves inconsistentes antes de montar o DataFrame
        normalized_rows: list[dict] = []
        for row in rows:
            numero_val = ""
            for key in ["Número", "N\u00famero", "Nï¿½mero", "Numero"]:
                val = row.pop(key, "")
                if val and not numero_val:
                    numero_val = val
            row["Número"] = numero_val
            row["Anunciante"] = row.get("Anunciante", "")
            normalized_rows.append(row)

        df = pd.DataFrame(normalized_rows)

        # Quartos/Banheiros/Vagas -> inteiros quando possível
        for col in ["Quartos", "Banheiros", "Vagas"]:
            if col not in df.columns:
                df[col] = ""
            else:
                df[col] = pd.to_numeric(df[col].astype(str).str.extract(r"(\d+)")[0], errors="coerce").astype("Int64")
                df[col] = df[col].astype(object).where(df[col].notna(), "")

        for col in ["Anunciante", "Número", "Local", "Rua", "Preço", "Área", "Link", "Imagem URL"]:
            if col not in df.columns:
                df[col] = ""

        n_rows = len(df)

        def ensure_series(col_name: str) -> pd.Series:
            if col_name in df.columns:
                return df[col_name].astype(str).fillna("").str.strip()
            return pd.Series([""] * n_rows)

        bairros: List[str] = []
        cidades: List[str] = []
        for val in ensure_series("Local"):
            b, c = extrai_bairro_e_cidade(val)
            if selected_zone:
                b_norm = strip_accents_keep(str(b)).lower()
                zone_norm = strip_accents_keep(selected_zone).lower()
                if b:
                    if zone_norm not in b_norm:
                        b = f"{b} + {selected_zone}"
                else:
                    b = selected_zone
            bairros.append(b)
            cidades.append(c)

        chosen_uf = (selected_uf or "").strip().upper()
        if chosen_uf:
            ufs = [chosen_uf] * n_rows
        else:
            ufs = [resolve_uf_por_cidade(c) for c in cidades]

        tipo_imovel_val = property_label or ""

        new_df = pd.DataFrame({
            "Tipo de Imóvel": pd.Series([tipo_imovel_val] * n_rows),
            "Logradouro": ensure_series("Rua"),
            "Número": ensure_series("Número"),
            "Complemento": pd.Series([""] * n_rows),
            "Bairro": pd.Series(bairros),
            "Cidade": pd.Series(cidades),
            "UF": pd.Series(ufs),
            "Imagem": pd.Series([""] * n_rows),
            "Coordenadas": pd.Series([""] * n_rows),
            "Fonte de informação": ensure_series("Anunciante"),
            "Telefone": pd.Series([""] * n_rows),
            "Idade (Anos)": pd.Series([""] * n_rows),
            "Conservação": pd.Series([""] * n_rows),
            "Padrão Ibape 2006": pd.Series([""] * n_rows),
            "Limite": pd.Series([""] * n_rows),
            "Frente": pd.Series([""] * n_rows),
            "Área de Terreno (m²)": ensure_series("Área"),
            "Topografia Descrição": pd.Series([""] * n_rows),
            "Área Construída (m²)": pd.Series([""] * n_rows),
            "Valor Oferta (R$)": ensure_series("Preço"),
            "Imagem URL": ensure_series("Imagem URL"),
            "Link Amostra": ensure_series("Link"),
            "Dormitórios": ensure_series("Quartos"),
            "Suíte": pd.Series([""] * n_rows),
            "WC Social": pd.Series([""] * n_rows),
            "Sala": pd.Series([""] * n_rows),
            "Cozinha": pd.Series([""] * n_rows),
            "Lavabo": ensure_series("Banheiros"),
            "Vagas": ensure_series("Vagas"),
        })

        return new_df

    finally:
        try:
            if driver:
                driver.quit()
        except Exception:
            pass
