/** Example cases for the "Load example" menu and the PDF tests. Fictional people. */
import { emptyParent, newCase, newId, type CaseFile } from './case';

function base(title: string): CaseFile {
  const c = newCase();
  c.title = title;
  c.calculationDate = '2026-10-22';
  c.caption = {
    district: 'Fourth',
    county: 'Ada',
    caseNumber: 'CV01-26-00000',
    petitioner: 'A',
    filer: {
      name: 'Jordan Example, ISB #00000',
      address: '100 W Main St',
      cityStateZip: 'Boise, ID 83702',
      phone: '(208) 555-0100',
      email: 'jordan@example.com',
    },
  };
  return c;
}

/** Rule 120(i)(3) example: two children, $25,000 and $10,000, primary custody. */
export function primaryExample(): CaseFile {
  const c = base('Example: primary custody (Rule 120 example)');
  c.parents.A = { ...emptyParent('Alex Rivera'), income: { ...emptyParent('').income, wages: '25000' } };
  c.parents.B = { ...emptyParent('Blair Rivera'), income: { ...emptyParent('').income, wages: '10000' } };
  c.children = [
    { id: newId(), name: 'Casey Rivera', birthDate: '2016-04-12', overnightsWithA: 52, highSchoolGraduation: '' },
    { id: newId(), name: 'Drew Rivera', birthDate: '2019-09-30', overnightsWithA: 52, highSchoolGraduation: '' },
  ];
  c.addOns.healthInsurance = { paidBy: 'A', monthly: '180', inSupport: true };
  c.addOns.childCare = { A: '', B: '400' };
  return c;
}

/** SPEC.md G4: $60,000 and $40,000, B has 110 overnights. */
export function sharedExample(): CaseFile {
  const c = base('Example: shared custody');
  c.parents.A = { ...emptyParent('Morgan Lee'), income: { ...emptyParent('').income, wages: '60000' } };
  c.parents.B = {
    ...emptyParent('Taylor Lee'),
    maritalStatus: 'remarried',
    income: { ...emptyParent('').income, businessReceipts: '58000', businessExpenses: '14000', selfEmploymentTax: '6000' },
  };
  c.children = [
    { id: newId(), name: 'Riley Lee', birthDate: '2014-02-03', overnightsWithA: 255, highSchoolGraduation: '2032-05-28' },
    { id: newId(), name: 'Sam Lee', birthDate: '2017-11-19', overnightsWithA: 255, highSchoolGraduation: '' },
  ];
  c.addOns.healthInsurance = { paidBy: 'A', monthly: '220', inSupport: false };
  return c;
}

/** Rule 120(i)(6)(B) shape: three children, two with A and one with B. */
export function splitExample(): CaseFile {
  const c = base('Example: split custody (2 + 1)');
  c.parents.A = { ...emptyParent('Jamie Park'), income: { ...emptyParent('').income, wages: '72000', overtimeOrSecondJob: '6000' } };
  c.parents.B = {
    ...emptyParent('Quinn Park'),
    income: { ...emptyParent('').income, wages: '41000' },
    deductions: { ...emptyParent('').deductions, otherChildrenInHome: 1 },
  };
  c.children = [
    { id: newId(), name: 'Avery Park', birthDate: '2011-06-01', overnightsWithA: 365, highSchoolGraduation: '' },
    { id: newId(), name: 'Blake Park', birthDate: '2013-08-15', overnightsWithA: 365, highSchoolGraduation: '' },
    { id: newId(), name: 'Cameron Park', birthDate: '2016-01-20', overnightsWithA: 0, highSchoolGraduation: '' },
  ];
  return c;
}

export const EXAMPLES = [
  { label: 'Primary custody', make: primaryExample },
  { label: 'Shared custody', make: sharedExample },
  { label: 'Split custody', make: splitExample },
];
