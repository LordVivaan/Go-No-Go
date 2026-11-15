export type EvaluationBasis =
  | 'NASA_STANDARD_REQUIREMENT'
  | 'NASA_HANDBOOK_GUIDANCE'
  | 'PHYSICAL_LAW'
  | 'ENGINEERING_APPROXIMATION'
  | 'GAMEPLAY_RULE';

export interface NasaReferenceEntry {
  id: string;
  code: string;
  title: string;
  version: string;
  url: string;
  basis: Extract<EvaluationBasis, 'NASA_STANDARD_REQUIREMENT' | 'NASA_HANDBOOK_GUIDANCE'>;
  scopeSummary: string;
  applicabilityCondition: string;
}

/**
 * Curated catalogue of official, publicly accessible NASA systems engineering
 * and spaceflight standards. Never invent section numbers, safety factors,
 * or test thresholds beyond what is documented in the source.
 */
export const NASA_REFERENCE_CATALOGUE: Record<string, NasaReferenceEntry> = {
  'NASA-SEH': {
    id: 'NASA-SEH',
    code: 'NASA/SP-2016-6105 Rev2',
    title: 'NASA Systems Engineering Handbook',
    version: 'Rev 2 (Online Reference)',
    url: 'https://www.nasa.gov/reference/systems-engineering-handbook/',
    basis: 'NASA_HANDBOOK_GUIDANCE',
    scopeSummary:
      'Life-cycle systems engineering guidance covering technical margins, trade studies, verification & validation, and risk management.',
    applicabilityCondition:
      'Applicable across all spacecraft architectures as non-mandatory engineering guidance for margin management and verification.',
  },
  'NASA-STD-7009B': {
    id: 'NASA-STD-7009B',
    code: 'NASA-STD-7009B, Change 1',
    title: 'Standard for Models and Simulations',
    version: '7009B Change 1',
    url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-7009',
    basis: 'NASA_STANDARD_REQUIREMENT',
    scopeSummary:
      'Establishes credibility, verification, validation, and uncertainty disclosure expectations for engineering models and simulations.',
    applicabilityCondition:
      'Applicable when assessing simulation fidelity, model assumptions, and unverified analytical margins.',
  },
  'NASA-STD-5001B': {
    id: 'NASA-STD-5001B',
    code: 'NASA-STD-5001B, Change 3',
    title: 'Structural Design and Test Factors of Safety for Spaceflight Hardware',
    version: '5001B Change 3',
    url: 'https://standards.nasa.gov/standard/nasa/nasa-std-5001',
    basis: 'NASA_STANDARD_REQUIREMENT',
    scopeSummary:
      'Defines structural design and test factors of safety for spaceflight hardware subject to launch and operational loads.',
    applicabilityCondition:
      'Applicable only where structural mass/bus envelope and launch load compatibility are being evaluated; not applicable to RF link or software logic.',
  },
  'NASA-STD-7001C': {
    id: 'NASA-STD-7001C',
    code: 'NASA-STD-7001C',
    title: 'Payload Vibroacoustic Test Criteria',
    version: '7001C',
    url: 'https://standards.nasa.gov/standard/nasa/nasa-std-7001',
    basis: 'NASA_STANDARD_REQUIREMENT',
    scopeSummary:
      'Provides vibroacoustic (acoustic and random vibration) qualification and acceptance test criteria for spaceflight payloads.',
    applicabilityCondition:
      'Applicable to launch-vehicle-to-payload mechanical/acoustic environment compatibility for physical payload hardware.',
  },
  'NASA-STD-7002B': {
    id: 'NASA-STD-7002B',
    code: 'NASA-STD-7002B, Change 1',
    title: 'Payload Test Requirements',
    version: '7002B Change 1',
    url: 'https://standards.nasa.gov/standard/NASA/NASA-STD-7002',
    basis: 'NASA_STANDARD_REQUIREMENT',
    scopeSummary:
      'Establishes environmental verification and test requirements (thermal vacuum, structural, functional) for flight payloads.',
    applicabilityCondition:
      'Applicable to payload environmental readiness (thermal operating limits and pre-launch verification coverage).',
  },
};

export function getNasaReferenceList(): NasaReferenceEntry[] {
  return Object.values(NASA_REFERENCE_CATALOGUE);
}
