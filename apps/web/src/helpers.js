export const DAY_MS = 1000 * 60 * 60 * 24;

export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const formatDateBR = (value) => {
  if (!value) return "";
  const raw = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  const isoParts = String(raw).split("-");
  if (isoParts.length === 3) {
    const [yyyy, mm, dd] = isoParts;
    if (yyyy.length === 4) return `${dd.slice(0, 2)}/${mm}/${yyyy}`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
};

export const toInputDateValue = (date) => {
  if (!date) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return startOfDay(value);
  }
  const str = String(value).trim();
  const isoParts = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoParts) return new Date(Number(isoParts[1]), Number(isoParts[2]) - 1, Number(isoParts[3]));
  const brParts = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brParts) return new Date(Number(brParts[3]), Number(brParts[2]) - 1, Number(brParts[1]));
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
};

export const addDays = (date, days) =>
  startOfDay(new Date(startOfDay(date).getTime() + Number(days || 0) * DAY_MS));

export const resolveSlaDate = (registro = {}) => {
  const raw = registro.slaDias;
  const numeric = Number(raw);
  const numericLike = raw !== "" && raw !== null && raw !== undefined && !Number.isNaN(numeric);
  const containsDateDelimiter = typeof raw === "string" && /[-/]/.test(raw);
  const parsedDate = parseDateValue(raw);

  if (parsedDate && (!numericLike || containsDateDelimiter || raw instanceof Date)) {
    return parsedDate;
  }

  if (numericLike) {
    const base =
      parseDateValue(registro.dataAcionamento) ||
      parseDateValue(registro.createdAt) ||
      startOfDay(new Date());
    return addDays(base, numeric);
  }

  return parsedDate || null;
};

export const deriveSlaInputValue = (registro = {}) => {
  const raw = registro.slaDias || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const resolved = resolveSlaDate(registro);
  return resolved ? toInputDateValue(resolved) : "";
};

export const getSlaInfo = (registro = {}) => {
  const dueDate = resolveSlaDate(registro);
  const concluded = registro.status === "CONCLUIDO";
  const baseDate =
    concluded && registro.concluidoEm ? parseDateValue(registro.concluidoEm) : startOfDay(new Date());
  if (!dueDate) {
    return { dueDate: null, dateLabel: "-", text: "-", variant: "none", daysDiff: null };
  }

  const diff = Math.ceil((dueDate - baseDate) / DAY_MS);
  let text = "";
  let variant = "ok";

  if (concluded) {
    if (diff < 0) {
      text = `Concluído (atrasado ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "dia" : "dias"})`;
      variant = "done-late";
    } else {
      text = `Concluído (faltavam ${diff} ${diff === 1 ? "dia" : "dias"})`;
      variant = "done";
    }
  } else if (diff < 0) {
    text = `ATRASADO ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "DIA" : "DIAS"}`;
    variant = "late";
  } else {
    text = `${diff} ${diff === 1 ? "dia" : "dias"} restantes`;
    variant = diff <= 3 ? "due-soon" : "ok";
  }

  return {
    dueDate,
    dateLabel: formatDateBR(toInputDateValue(dueDate)),
    text,
    variant,
    daysDiff: diff,
  };
};

export const RESPONSAVEIS_ADM_OPTIONS = ["Matheus Guedes", "João Cabral"];
export const PROSPECTOR_OPTIONS = [
  "Reginaldo Marabello",
  "Edimilson Teles",
  "Hagatta Brum",
  "Eduardo",
  "Renato Vigerelli",
];
