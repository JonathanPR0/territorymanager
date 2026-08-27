import { format } from "date-fns";

export const normalizeNumberOnly = (value: string | undefined) => {
  if (!value) return "";
  return value.replace(/[\D]/g, "");
};

export const normalizePhoneNumber = (value: string | undefined) => {
  if (!value) return "";

  const digits = value.replace(/\D/g, "");
  const hasCountryCode = digits.startsWith("55") && digits.length > 11;
  const phone = hasCountryCode ? digits.slice(2) : digits;

  const formattedPhone = phone
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(-\d{4})(\d+?)/, "$1");

  return hasCountryCode ? `+55 ${formattedPhone}` : formattedPhone;
};

export const normalizeCnpjNumber = (value: string | undefined) => {
  if (!value) return "";
  const pureValue = value.replace(/[\D]/g, "");
  if (pureValue.length <= 11) {
    return pureValue
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  }
  return pureValue
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

export const normalizeCepNumber = (value: string | undefined) => {
  if (!value) return "";
  return value
    .replace(/\D/g, "")
    .replace(/^(\d{5})(\d{3})/, "$1-$2")
    .replace(/(-\d{3})(\d+?)/, "$1")
    .substring(0, 9);
};

export const normalizePercentual = (value: string | undefined, casasDecimais = 2) => {
  return parseFloat(value || "0").toLocaleString("pt-BR", {
    style: "percent",
    minimumFractionDigits: casasDecimais,
  });
};

export const normalizeDataDayOne = (dataString?: string) => {
  if (dataString) {
    const data = new Date(dataString);

    const ano = data.getFullYear();
    const mes = (data.getMonth() + 1).toString().padStart(2, "0");

    const dataFormatada = `${ano}-${mes}-01`;

    return dataFormatada;
  }
};

export const normalizeDate = (data?: string | Date) => (data ? format(data, "dd/MM/yyyy") : null);
export const normalizeCurrency = (data?: string | number) => {
  if (!data) {
    return "R$ 0,00";
  }
  if (typeof data === "string") {
    const valor = parseFloat(data);
    if (!valor) return "R$ 0,00";
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  } else {
    return data.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  }
};

export const normalizeFirstAndLastName = (nomeCompleto: string) => {
  if (!nomeCompleto) return "NOME NÃO INFORMADO!";
  // Usa uma expressão regular para extrair o primeiro e último nome
  const match = nomeCompleto.match(/^(\S+)\s+(.+)\s+(\S+)$/);

  // Verifica se houve uma correspondência
  if (match) {
    const primeiroNome = match[1];
    const ultimoNome = match[3];
    return `${primeiroNome} ${ultimoNome}`;
  } else {
    // Se não houver correspondência, assume que o nome completo é o primeiro nome
    return `${nomeCompleto}`;
  }
};

export const normalizeMes = (mes: string | number) => {
  const arrayMes = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  if (mes) {
    return arrayMes[+mes - 1].toLocaleLowerCase();
  }
};

export const sliceString = (texto: string, maxWidth: number) => {
  if (texto.length > maxWidth) {
    const ultimaPosicaoEspaco = texto.lastIndexOf(" ", maxWidth);
    const textoCortado =
      ultimaPosicaoEspaco === -1 ? texto.slice(0, maxWidth) : texto.slice(0, ultimaPosicaoEspaco);
    return textoCortado + "...";
  } else {
    return texto;
  }
};

export function normalizeNumberFixed(number: string | number | null, fractionDigits: number) {
  if (typeof number === "string" && parseFloat(number)) {
    return parseFloat(parseFloat(normalizeNumberOnly(number) || "0").toFixed(fractionDigits));
  }
  if (typeof number === "number" && !isNaN(number)) {
    return parseFloat(number.toFixed(fractionDigits) || "0");
  }
  return 0;
}

export function parseCurrency(value: string) {
  // Remove o símbolo "R$" e espaços em branco
  let numericValue = value.replace(/[R$\s]/g, "");

  // Remove o separador de milhar (pontos) e substitui a vírgula por ponto
  numericValue = numericValue.replace(/\./g, "").replace(",", ".");

  // Converte para número
  return parseFloat(numericValue);
}
