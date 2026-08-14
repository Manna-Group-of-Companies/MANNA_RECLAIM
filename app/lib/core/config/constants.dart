import 'package:flutter/material.dart';

/// Shared domain vocabulary. Mirrors client/src/config/constants.ts, which in
/// turn mirrors server/src/config/constants.js - keep all three in step.
///
/// Nothing here is a Flutter-side invention. Where a rule is enforced it is
/// enforced on the server; these lists only keep a screen from offering a tap
/// that comes back 403.

// ---------------------------------------------------------------- roles ----

class Roles {
  const Roles._();
  static const worker = 'worker';
  static const supervisor = 'supervisor';
  static const lab = 'lab';
  static const manager = 'manager';
  static const admin = 'admin';
}

const adminRoles = <String>[Roles.manager, Roles.admin];

/// Who may delete, as opposed to who may correct. The admin account alone -
/// deliberately narrower than [adminRoles]. It gates the destructive controls
/// the shop floor can reach: clearing a weighing on Weigh, and clearing an
/// emptied group on Stock. Enforced on the server; mirrored so no dead tap is
/// offered.
const deleteRoles = <String>[Roles.admin];

/// Who may issue a dispatch, and therefore who is shown the customer list.
/// The yard as well as the back office - the vehicle is loaded at the yard and
/// the supervisor standing at it knows what went on it.
const dispatchRoles = <String>[Roles.supervisor, Roles.manager, Roles.admin];

/// Who gets the shop floor. Quality is the lab's page and is deliberately not
/// in this app at all - it stays in the React website.
const floorRoles = <String>[
  Roles.worker,
  Roles.supervisor,
  Roles.manager,
  Roles.admin,
];

// -------------------------------------------------------------- domain -----

const shifts = <String>['Day', 'Night'];

const qualities = <String>[
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'DRC',
  'Special DRC',
];

/// The grades a batch is tracked as yielding - the rows of the batch card's
/// grid. Both DRC grades are left out of the batch lifecycle on purpose; they
/// stay grades everywhere else. The API counts the same set.
const batchQualities = <String>['Special', 'SuperFine', 'Fine', 'Medium'];

const dispatchGrades = <String>[
  'Special',
  'SuperFine',
  'Fine',
  'Medium',
  'Coarse',
  'Sillsheet',
];

const firewoodKgPerLoad = 550;

/// A coarse load is a shorter cook than a special one, so it burns less.
const firewoodKgPerCoarseLoad = 400;

/// One packed sack. Anything under this is carried into the next batch.
const sackKg = 50;

/// How many weighed runs the Weigh tab lists before its Show all.
const weighedPage = 20;

/// How far the count off the bench may sit from what the cycle and the mould
/// say before the run is flagged, as a percentage. Mirrors the server's figure,
/// which is where the stored flag is actually decided.
const piecesVariancePct = 10;

/// Soorya is metered on one phase only, so its energy is the difference x 3.
const todMachineId = 'GRD_O';

/// The cracker, singled out of the grinding line for one thing: picking.
const crackerIds = <String>['CRK'];

bool isCracker(String? machineId) =>
    machineId != null && crackerIds.contains(machineId);

/// Sleeve and loop - the two activities that make finished goods a lot at a
/// time. They sit beside the presses rather than inside them: what they make is
/// certified a shift at a time under a generated batch number.
const mouldingKinds = <String>['sleeve', 'loop'];

bool isMoulding(String? kind) => kind != null && mouldingKinds.contains(kind);

/// Supervisors who sign for a shift, as the prototype hard-coded them.
///
/// Only the fallback now. The pick reads the plant's own accounts from
/// `GET /users/signers`, so a supervisor renamed or added in the back office
/// reaches the tablets instead of drifting from this list. This is what a
/// device that has never reached the server is left with - see
/// [UiStore.supervisorOptions].
const supervisorNames = <String>['Mathai', 'Rahul', 'Devanand'];

/// The clock each shift covers, shown under the shift picks.
const shiftHours = <String, String>{
  'Day': '08:30 – 20:30',
  'Night': '20:30 – 08:30',
};

/// The two feedstocks the grinding line runs on, and the crumb each yields.
class Tyre {
  const Tyre(this.label, this.mesh);
  final String label;
  final String mesh;
}

const tyres = <String, Tyre>{
  'truck': Tyre('Truck tyre', '30#'),
  'bike': Tyre('Bike tyre', '20#'),
};

/// What a stock count counts, and how to say it. Reclaim and coarse are bagged,
/// so they are sacks; a moulding press counts finished goods one at a time, so
/// they are pieces. Both live in the same field, so `unit` is the only thing
/// standing between "4,000 loops" and a screen reading four thousand sacks.
const unitNoun = <String, ({String one, String many})>{
  'sacks': (one: 'sack', many: 'sacks'),
  'pieces': (one: 'piece', many: 'pieces'),
};

/// "40 sacks", "1 piece" - a count that says what it is counting.
String counted(num n, [String unit = 'sacks']) {
  final noun = unitNoun[unit] ?? unitNoun['sacks']!;
  final value = n == n.roundToDouble() ? n.round() : n;
  return '$value ${n == 1 ? noun.one : noun.many}';
}

// ----------------------------------------------------------- autoclave -----

/// What an autoclave can be charged with. A special load opens a batch the
/// refiners then work through; a coarse load feeds the coarse line for the
/// shift and never becomes a batch of its own.
class AutoclaveForm {
  const AutoclaveForm({
    required this.name,
    required this.capacity,
    required this.type,
    this.grade,
  });

  final String name;
  final int capacity;

  /// 'special' or 'coarse'.
  final String type;
  final String? grade;
}

const autoclaveForms = <AutoclaveForm>[
  AutoclaveForm(
    name: 'Special 2200',
    capacity: 2200,
    type: 'special',
    grade: 'Special',
  ),
  AutoclaveForm(
    name: 'Special 2500',
    capacity: 2500,
    type: 'special',
    grade: 'Special',
  ),
  AutoclaveForm(name: 'DRC 2200', capacity: 2200, type: 'special', grade: 'DRC'),
  AutoclaveForm(name: 'DRC 2500', capacity: 2500, type: 'special', grade: 'DRC'),
  AutoclaveForm(
    name: 'Special DRC 2200',
    capacity: 2200,
    type: 'special',
    grade: 'Special DRC',
  ),
  AutoclaveForm(
    name: 'Special DRC 2500',
    capacity: 2500,
    type: 'special',
    grade: 'Special DRC',
  ),
  AutoclaveForm(name: 'Coarse 2200', capacity: 2200, type: 'coarse'),
  AutoclaveForm(name: 'Coarse 2500', capacity: 2500, type: 'coarse'),
];

/// The formulations that fit this vessel - specials first, then coarse.
List<AutoclaveForm> autoclaveFormsFor(num? capacity) => capacity == null
    ? const []
    : autoclaveForms.where((f) => f.capacity == capacity).toList();

/// The grades that ride the special vessels but are counted by their runs - a
/// list rather than a `!= 'DRC'` because there are two of them now.
const runCountedGrades = <String>['DRC', 'Special DRC'];

/// Whether charging this formulation opens a batch the refiners work through.
/// Only a special charge does, and not every special-vessel charge is one: a
/// coarse charge feeds the coarse line for the shift and a DRC charge - either
/// grade - is counted by its runs. The API applies the same rule and refuses
/// them.
bool opensBatch(AutoclaveForm? form) =>
    form?.type == 'special' && !runCountedGrades.contains(form?.grade);

/// Two hands charge two autoclaves between them, so a paired load costs one
/// worker; charged on its own it takes both.
int autoclaveWorkers(bool paired) => paired ? 1 : 2;

/// The crew a machine usually runs with, prefilled at stop so the common case
/// is a glance rather than a keystroke.
int? defaultWorkers(String machineId, String shift, bool shiftwise) {
  switch (machineId) {
    case 'PR1':
    case 'PR2':
      return 3;
    case 'R1':
    case 'R3':
      return 2;
    case 'R2':
    case 'R4':
      return 3;
    case 'CRK':
      return 2;
    case 'GRD_K':
    case 'GRD_S':
      return shift == 'Night' ? 2 : 1;
    case 'PRS_P3':
    case 'PRS_P5':
      return 2;
    case 'SLEEVE':
    case 'LOOP':
      return 2;
    default:
      return shiftwise ? 2 : null;
  }
}

// -------------------------------------------------------------- colour -----

/// The accent each machine kind gets on its card rail and CTA. Sleeve and loop
/// get a colour each rather than sharing one: they are two activities on two
/// cards and a crew picks the card out by its rail before it reads the name.
const kindAccent = <String, Color>{
  'grind': Color(0xFF8A9EB0),
  'autoclave': Color(0xFFF79C56),
  'coarse': Color(0xFFF79C56),
  'prerefiner': Color(0xFF5CC8DE),
  'refiner': Color(0xFF5CC8DE),
  'press': Color(0xFF4D9FE8),
  'sleeve': Color(0xFF7EC9A0),
  'loop': Color(0xFFC99ADE),
};

/// Eight grades the crew picks by colour before they read the name. Laid out
/// round the wheel at a roughly even lightness so no two are confusable at
/// arm's length under plant light - see the note in the web client's index.css,
/// including why Special DRC is an azure rather than a second purple.
const qualityColour = <String, Color>{
  'Special': Color(0xFF3FD2D4),
  'SuperFine': Color(0xFF7AE78D),
  'Fine': Color(0xFFF8D64C),
  'Medium': Color(0xFFF69835),
  'Coarse': Color(0xFFFB7CBD),
  'DRC': Color(0xFFB994F8),
  'Special DRC': Color(0xFF33C5FF),
  'Sillsheet': Color(0xFFD7DFE8),
};
