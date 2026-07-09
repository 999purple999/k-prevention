/**
 * Modello fiscale italiano. Distingue due grandezze:
 *  - accrued: imposta+contributi MATURATI sul reddito incassato del mese.
 *  - cashOut: imposta effettivamente PAGATA (gestita dal motore sui mesi di paymentSchedule).
 *
 * Regime forfettario (regime di CASSA): l'imponibile si calcola sui ricavi INCASSATI.
 * Le spese NON sono deducibili: `deductible`/`deductiblePercentage` sono ignorati e il
 * motore alza il flag `deduzioni_ignorate_regime_forfettario`. Vedi _engineRules.7.
 *
 * Se un valore fiscale è null (finito in `_unverified`), il motore LANCIA un errore
 * esplicito con il path del campo. Mai un default, mai zero: un modello con aliquote
 * inventate ha l'aria di sapere.
 */
import type { TaxModel } from './types.ts';

export class MissingTaxRate extends Error {
  constructor(path: string) {
    super(`Valore fiscale non verificato/mancante: ${path}. Inseriscilo prima di simulare.`);
    this.name = 'MissingTaxRate';
  }
}

function req(value: number | null | undefined, path: string): number {
  if (value == null || Number.isNaN(value)) throw new MissingTaxRate(path);
  return value;
}

/** Valida i campi fiscali richiesti dal regime attivo. Lancia MissingTaxRate al primo null. */
export function validateTaxModel(tax: TaxModel): void {
  if (tax.regime === 'forfettario') {
    const f = tax.forfettario;
    if (!f) throw new MissingTaxRate('taxModel.forfettario');
    req(f.coefficienteRedditivita, 'taxModel.forfettario.coefficienteRedditivita');
    req(f.aliquotaSostitutiva, 'taxModel.forfettario.aliquotaSostitutiva');
    req(f.aliquotaPostAgevolazione, 'taxModel.forfettario.aliquotaPostAgevolazione');
    req(f.anniAliquotaRidotta, 'taxModel.forfettario.anniAliquotaRidotta');
    req(f.annoInizioAttivita, 'taxModel.forfettario.annoInizioAttivita');
    req(f.gestioneSeparataPercent, 'taxModel.forfettario.gestioneSeparataPercent');
  } else {
    const o = tax.ordinario;
    if (!o) throw new MissingTaxRate('taxModel.ordinario');
    if (!o.scaglioniIRPEF || o.scaglioniIRPEF.length === 0) throw new MissingTaxRate('taxModel.ordinario.scaglioniIRPEF');
    o.scaglioniIRPEF.forEach((s, i) => req(s.aliquota, `taxModel.ordinario.scaglioniIRPEF[${i}].aliquota`));
    req(o.contributiINPSPercent, 'taxModel.ordinario.contributiINPSPercent');
  }
}

/** Aliquota sostitutiva applicabile all'anno fiscale (agevolata vs a regime). */
function forfettarioAliquota(tax: TaxModel, fiscalYear: number): number {
  const f = tax.forfettario!;
  const inizio = req(f.annoInizioAttivita, 'taxModel.forfettario.annoInizioAttivita');
  const anni = req(f.anniAliquotaRidotta, 'taxModel.forfettario.anniAliquotaRidotta');
  const agevolato = fiscalYear <= inizio + anni - 1;
  return agevolato
    ? req(f.aliquotaSostitutiva, 'taxModel.forfettario.aliquotaSostitutiva')
    : req(f.aliquotaPostAgevolazione, 'taxModel.forfettario.aliquotaPostAgevolazione');
}

/**
 * Imposta + contributi MATURATI sul reddito imponibile incassato in questo mese.
 * `taxableCashThisMonth`: ricavi da P.IVA incassati e imponibili nel mese.
 */
export function accruedTaxForMonth(tax: TaxModel, taxableCashThisMonth: number, fiscalYear: number): number {
  if (taxableCashThisMonth <= 0) return 0;
  if (tax.regime === 'forfettario') {
    const f = tax.forfettario!;
    const coeff = req(f.coefficienteRedditivita, 'taxModel.forfettario.coefficienteRedditivita');
    const gs = req(f.gestioneSeparataPercent, 'taxModel.forfettario.gestioneSeparataPercent') / 100;
    const rid = (f.riduzioneContributiPercent ?? 0) / 100;
    const aliquota = forfettarioAliquota(tax, fiscalYear) / 100;
    const imponibile = taxableCashThisMonth * coeff;
    const contributi = imponibile * gs * (1 - rid);
    const imposta = Math.max(0, imponibile - contributi) * aliquota;
    return contributi + imposta;
  }
  // Regime ordinario — approssimazione mensile (annualizzazione del reddito del mese).
  const o = tax.ordinario!;
  const inps = req(o.contributiINPSPercent, 'taxModel.ordinario.contributiINPSPercent') / 100;
  const addiz = ((o.addizionaleRegionalePercent ?? 0) + (o.addizionaleComunalePercent ?? 0)) / 100;
  const annuo = taxableCashThisMonth * 12;
  let irpefAnnuo = 0;
  for (const s of o.scaglioniIRPEF!) {
    const top = s.max ?? Infinity;
    if (annuo > s.min) irpefAnnuo += (Math.min(annuo, top) - s.min) * ((s.aliquota ?? 0) / 100);
  }
  const effRate = annuo > 0 ? irpefAnnuo / annuo : 0;
  const contributi = taxableCashThisMonth * inps;
  const imposta = taxableCashThisMonth * (effRate + addiz);
  return contributi + imposta;
}

/** Mesi di calendario (1-12) in cui esce cassa fiscale. */
export function paymentMonthsSet(tax: TaxModel): Set<number> {
  const p = tax.paymentSchedule;
  return new Set([p.saldoMonth, p.primoAccontoMonth, p.secondoAccontoMonth].filter((m) => m >= 1 && m <= 12));
}
