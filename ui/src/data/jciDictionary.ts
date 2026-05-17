// JCI Metasys / CCT Class ID Dictionary
// Sources:
//   CCT  — M4-CGE09090-11.0.4.9 Primitives.xml (ships with every CCT install)
//   SCT  — DaytonaStateCollege.dbexport (real-world 87,951-object campus archive)
//   Both — confirmed present in both contexts

export type DictContext = 'cct' | 'sct' | 'both';

export interface DictEntry {
  classid: number;
  name: string;
  category: string;
  description: string;
  bacnetType: number | null;    // ASHRAE 135 object type number (null = JCI proprietary)
  bacnetTypeName: string | null;
  context: DictContext;
  source: string;
  notes?: string;
}

// ASHRAE 135 BACnet object type names
const BT: Record<number, string> = {
  0: 'Analog Input', 1: 'Analog Output', 2: 'Analog Value',
  3: 'Binary Input', 4: 'Binary Output', 5: 'Binary Value',
  6: 'Calendar', 7: 'Command', 8: 'Device', 9: 'Event Enrollment',
  10: 'File', 11: 'Group', 12: 'Loop', 13: 'Multi-State Input',
  14: 'Multi-State Output', 15: 'Notification Class', 16: 'Program',
  17: 'Schedule', 18: 'Averaging', 19: 'Multi-State Value',
  20: 'Trend Log', 23: 'Pulse Converter', 56: 'Network Port',
};

export const DICTIONARY: DictEntry[] = [

  // ─── CCT Control Sequence Structure ──────────────────────────────────────

  { classid: 575, name: 'Control Sequence', category: 'CCT — Program Structure',
    description: 'Top-level container for a CCT controller application program. One Control Sequence per controller application. Contains all Control Activities, Control Points, and supporting primitives that define the control logic.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 536, name: 'Control Activity', category: 'CCT — Program Structure',
    description: 'Groups a related set of control logic within a Control Sequence — for example, "Cooling Control" or "Heating Control". Analogous to a function block group in IEC 61131-3.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 555, name: 'Control Point', category: 'CCT — Program Structure',
    description: 'The central logical variable in CCT programming. Represents a commandable value with a full BACnet command priority hierarchy (priorities 1–16). Each Control Point maps to a BACnet commandable object (AO, BO, AV, BV, or MSV). Its Input Blocks receive commands from upstream logic; its Output Blocks drive downstream consumers.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 540, name: 'State Selection Primitive', category: 'CCT — Program Structure',
    description: 'Selects between multiple operating states or modes. Used to implement mode logic such as Off/Heating/Cooling/Auto based on input conditions.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 543, name: 'Command Hierarchy', category: 'CCT — Program Structure',
    description: 'Manages the BACnet command priority array for a Control Point. Arbitrates between multiple input sources at priorities 1–16, outputting the highest-priority active command to the Control Point.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 541, name: 'FSM', category: 'CCT — Program Structure',
    description: 'Finite State Machine. Transitions between defined named states based on conditions and timers. Used to sequence equipment startup/shutdown or manage operating modes.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Signal Blocks (wiring terminals) ────────────────────────────────

  { classid: 526, name: 'Input Float Block', category: 'CCT — Signal Block',
    description: 'Float-typed input terminal on a Control Point or logic block. A wire from an upstream Output Float Block connects here to deliver a float command or signal. Two Input Float Blocks typically define the commandable range: one for the maximum value and one for the minimum (often 16 and 0, representing 100% and 0%).',
    bacnetType: 2, bacnetTypeName: BT[2], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 527, name: 'Output Float Block', category: 'CCT — Signal Block',
    description: 'Float-typed output terminal. Broadcasts a float value (e.g., a sensor reading or computed result) from a Sensor or Control Point to downstream Input Float Blocks.',
    bacnetType: 2, bacnetTypeName: BT[2], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 528, name: 'Input Enum Block', category: 'CCT — Signal Block',
    description: 'Enumeration-typed input terminal. Receives a discrete state value from an upstream Output Enum Block.',
    bacnetType: 19, bacnetTypeName: BT[19], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 529, name: 'Output Enum Block', category: 'CCT — Signal Block',
    description: 'Enumeration-typed output terminal. Broadcasts a discrete state value (e.g., mode selection) to downstream Input Enum Blocks.',
    bacnetType: 19, bacnetTypeName: BT[19], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 530, name: 'Input Boolean Block', category: 'CCT — Signal Block',
    description: 'Boolean-typed input terminal. Receives a true/false signal from an upstream Output Boolean Block.',
    bacnetType: 5, bacnetTypeName: BT[5], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 531, name: 'Output Boolean Block', category: 'CCT — Signal Block',
    description: 'Boolean-typed output terminal. Broadcasts a true/false value to downstream Input Boolean Blocks.',
    bacnetType: 5, bacnetTypeName: BT[5], context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Math & Logic Primitives ─────────────────────────────────────────

  { classid: 252, name: 'PID', category: 'CCT — Control',
    description: 'Proportional-Integral-Derivative controller. Computes a corrective output to drive a measured process variable to a setpoint. Used for valve position, VFD speed, damper position, etc.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 582, name: 'PID Pre Process', category: 'CCT — Control',
    description: 'Pre-processor for PID input. Conditions or scales the process variable before it enters the PID block.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 580, name: 'Multi-Stage Controller', category: 'CCT — Control',
    description: 'Controls staged equipment with discrete stages (e.g., 2-stage cooling, multi-stage heating). Sequences stages on/off based on a process variable and setpoint, with adjustable differentials between stages.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 561, name: 'Math Primitive', category: 'CCT — Calculation',
    description: 'Performs mathematical operations on float inputs: add, subtract, multiply, divide, min, max, absolute value, etc.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 560, name: 'Comparison Primitive', category: 'CCT — Calculation',
    description: 'Compares two float or enumeration values and outputs a Boolean result (greater than, less than, equal, etc.).',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 559, name: 'Boolean Primitive', category: 'CCT — Calculation',
    description: 'Performs Boolean logic operations on binary inputs: AND, OR, NOT, XOR, NAND, NOR.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 562, name: 'Mux Primitive', category: 'CCT — Calculation',
    description: 'Multiplexer. Selects one of several float inputs to pass to the output, based on an enumeration or integer selector signal.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 546, name: 'Line Segment Primitive', category: 'CCT — Calculation',
    description: 'Piecewise linear interpolation. Maps an input value to an output using a user-defined curve of breakpoints. Used for reset schedules, nonlinear compensation, and unit conversion.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 558, name: 'Timer Primitive', category: 'CCT — Calculation',
    description: 'Provides time-based logic: on-delay, off-delay, pulse, and elapsed-time functions.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 574, name: 'Latch Primitive', category: 'CCT — Calculation',
    description: 'A set/reset latch that holds a Boolean state. Output remains set until explicitly reset.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 569, name: 'Rate Limiter Primitive', category: 'CCT — Calculation',
    description: 'Limits the rate of change of a float signal (slew rate limiter). Prevents abrupt jumps in commanded values, useful for gradual valve or damper positioning.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 538, name: 'Last Value', category: 'CCT — Calculation',
    description: 'Retains the last valid (non-fault) value of a signal. Provides a fallback when the source becomes unreliable or communication fails.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 573, name: 'Span Primitive', category: 'CCT — Calculation',
    description: 'Scales a float input from one range to another (linear interpolation between min/max spans). Used for engineering unit conversion and sensor scaling.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 266, name: 'EWMA', category: 'CCT — Calculation',
    description: 'Exponentially Weighted Moving Average filter. Smooths a noisy input signal by giving more weight to recent samples. Used to filter sensor noise.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 570, name: 'Flow Primitive', category: 'CCT — Calculation',
    description: 'Calculates airflow or fluid flow from differential pressure and duct/pipe geometry. Used with pressure sensors on VAV boxes and airflow measuring stations.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 591, name: 'Totalization Primitive', category: 'CCT — Calculation',
    description: 'Accumulates a running total of a float value over time. Used for energy metering, runtime hours, and consumption tracking.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 571, name: 'Sequencer Primitive', category: 'CCT — Calculation',
    description: 'Sequences multiple outputs in rotation to equalize runtime across redundant equipment (e.g., lead/lag pump or chiller sequencing).',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 587, name: 'Statistic Primitive', category: 'CCT — Calculation',
    description: 'Computes statistical values (min, max, average) across an array of float inputs over time or across multiple points.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 587, name: 'Statistic Primitive', category: 'CCT — Calculation',
    description: 'Computes statistical values (min, max, average) across an array of float inputs or across multiple points.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 539, name: 'Reliability Check Primitive', category: 'CCT — Calculation',
    description: 'Monitors the reliability of an input signal. Outputs a fault status if the value is out of range, stale, or the source object is in fault.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 614, name: 'Reliability Merge Primitive', category: 'CCT — Calculation',
    description: 'Combines reliability statuses from multiple sources into a single reliability output.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 592, name: 'Pass Through Primitive', category: 'CCT — Calculation',
    description: 'Routes a signal unchanged from input to output. Used to make a value available as a named point in the program.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 593, name: 'Text Primitive', category: 'CCT — Calculation',
    description: 'Stores and outputs a text string value.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Constants ────────────────────────────────────────────────────────

  { classid: 551, name: 'Float Constant', category: 'CCT — Constant',
    description: 'Stores a fixed float value that can be wired as a source to other blocks. Used for setpoints, limits, and configuration values within the program logic.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 552, name: 'Boolean Constant', category: 'CCT — Constant',
    description: 'Stores a fixed true/false value for use in Boolean logic.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 568, name: 'Enum Constant', category: 'CCT — Constant',
    description: 'Stores a fixed enumeration value for use in mode selection or comparison logic.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Sensors & Inputs ────────────────────────────────────────────────

  { classid: 556, name: 'Sensor Primitive', category: 'CCT — Sensor',
    description: 'Reads a measured value from a source (physical hardware input, BACnet point, or network signal) and makes it available to the control logic. The primary way external measurements enter a CCT program.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 595, name: 'Execution Status Primitive', category: 'CCT — Sensor',
    description: 'Monitors the execution status of a control sequence or activity. Outputs a status indication useful for diagnostics.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT HVAC-Specific Primitives ────────────────────────────────────────

  { classid: 564, name: 'DP (Differential Pressure)', category: 'CCT — HVAC',
    description: 'Calculates differential pressure from two pressure sensor inputs. Used for filter monitoring, fan differential, and VAV damper pressure.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 565, name: 'ENTH (Enthalpy)', category: 'CCT — HVAC',
    description: 'Calculates air enthalpy from dry-bulb temperature and relative humidity inputs. Used for economizer control and energy calculations.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 566, name: 'RH (Relative Humidity)', category: 'CCT — HVAC',
    description: 'Calculates relative humidity from temperature and dewpoint or wet-bulb inputs.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 567, name: 'WB (Wet Bulb)', category: 'CCT — HVAC',
    description: 'Calculates wet-bulb temperature from dry-bulb temperature and relative humidity. Used for cooling tower control.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 563, name: 'ABH (Absolute Humidity)', category: 'CCT — HVAC',
    description: 'Calculates absolute humidity (moisture content) from temperature and relative humidity inputs.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 581, name: 'Free Cooling', category: 'CCT — HVAC',
    description: 'Determines free cooling availability by comparing outdoor air conditions (temperature, enthalpy) against return air conditions.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 532, name: 'Summer/Winter Compensation', category: 'CCT — HVAC',
    description: 'Adjusts a setpoint based on outdoor air temperature — reset schedule for supply air or space temperature setpoints.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 612, name: 'Box Flow Test', category: 'CCT — HVAC',
    description: 'Performs an airflow calibration test on a VAV box. Drives the damper to known positions to measure the actual flow coefficient.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 631, name: 'VAV Balancer', category: 'CCT — HVAC',
    description: 'Balances airflow across multiple VAV boxes in a system to meet total flow requirements.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 632, name: 'Variable Speed Drive', category: 'CCT — HVAC',
    description: 'Interface block for VFD (Variable Frequency Drive) integration within a CCT program.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 724, name: 'Cooling Tower Control', category: 'CCT — HVAC',
    description: 'Near-Optimal Open Loop Cooling Tower Control. Calculates optimal cooling tower leaving water temperature setpoint based on wet-bulb temperature.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 524, name: 'Occupancy Mode', category: 'CCT — HVAC',
    description: 'Determines occupancy mode (Occupied/Standby/Unoccupied) from schedule, override, and motion inputs.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 523, name: 'ZN-T Setpoint', category: 'CCT — HVAC',
    description: 'Calculates zone temperature setpoints for heating and cooling based on occupancy mode, setpoint adjustments, and limits.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Equipment Staging ────────────────────────────────────────────────

  { classid: 917, name: 'Boiler Stager', category: 'CCT — Equipment Staging',
    description: 'Sequences multiple boilers on/off based on heating load demand with lead/lag rotation.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 918, name: 'Chiller Stager', category: 'CCT — Equipment Staging',
    description: 'Sequences multiple chillers on/off based on cooling load demand with lead/lag rotation.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 916, name: 'Device Stager', category: 'CCT — Equipment Staging',
    description: 'Generic equipment staging for any multi-unit system. Sequences devices on/off based on demand with configurable staging differential.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 708, name: 'Pump Selector', category: 'CCT — Equipment Staging',
    description: 'Lead/lag pump selection with run-time equalization.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 709, name: 'Chiller Selector', category: 'CCT — Equipment Staging',
    description: 'Chiller selection and staging with capacity tracking.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 745, name: 'Tower Selector', category: 'CCT — Equipment Staging',
    description: 'Cooling tower fan/cell selection with lead/lag rotation.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 768, name: 'Heat Exchanger Selector', category: 'CCT — Equipment Staging',
    description: 'Heat exchanger selection for free-cooling or condenser loop applications.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 705, name: 'Capacity Calculation', category: 'CCT — Equipment Staging',
    description: 'Calculates available and required capacity for a central plant system (chiller, boiler).',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 706, name: 'Load Calculator', category: 'CCT — Equipment Staging',
    description: 'Calculates thermal load based on flow and delta-T measurements.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Safety & Protection ──────────────────────────────────────────────

  { classid: 715, name: 'Analog Override Check', category: 'CCT — Safety',
    description: 'Monitors an analog output for out-of-range conditions. Generates a fault status if the commanded value cannot be achieved.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 716, name: 'Binary Override Check', category: 'CCT — Safety',
    description: 'Monitors a binary output for feedback mismatch. Generates a fault status if the commanded state and feedback disagree after a configurable delay.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 702, name: 'Equipment Interlock', category: 'CCT — Safety',
    description: 'Enforces permissive and interlock conditions between equipment. Prevents a piece of equipment from operating unless all interlock conditions are satisfied.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 701, name: 'Device Enable', category: 'CCT — Safety',
    description: 'Determines if a device is allowed to run based on enable/disable conditions, schedules, and operator overrides.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 704, name: 'Device Alarm', category: 'CCT — Safety',
    description: 'Monitors equipment status points and generates BACnet alarms on fault conditions.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 707, name: 'Blocking Protection', category: 'CCT — Safety',
    description: 'Protects against valve or damper hunting by adding hysteresis and blocking rapid reversals.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 779, name: 'Fault Manager', category: 'CCT — Safety',
    description: 'Collects and prioritizes fault conditions from multiple sources. Generates a composite fault output and manages alarm notification.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 776, name: 'Expression', category: 'CCT — Safety',
    description: 'Evaluates a user-defined mathematical or logical expression combining multiple inputs.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Hardware I/O ────────────────────────────────────────────────────

  { classid: 240, name: 'AI HW Input', category: 'CCT — Hardware I/O',
    description: 'Physical analog input terminal on the controller (0–10 V, 4–20 mA, resistance/thermistor, or voltage). Maps to a BACnet AI object.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 241, name: 'AO HW Output', category: 'CCT — Hardware I/O',
    description: 'Physical analog output terminal on the controller (0–10 V or 4–20 mA). Drives actuators, VFDs, and valve positioners. Maps to a BACnet AO object.',
    bacnetType: 1, bacnetTypeName: BT[1], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 242, name: 'BI HW Input', category: 'CCT — Hardware I/O',
    description: 'Physical binary/digital input terminal (dry contact or voltage). Used for status feedback, switch inputs, and alarm inputs. Maps to a BACnet BI object.',
    bacnetType: 3, bacnetTypeName: BT[3], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 239, name: 'BO HW Output', category: 'CCT — Hardware I/O',
    description: 'Physical binary/digital output terminal (relay or triac). Drives on/off loads such as fans, pumps, and lighting contactors. Maps to a BACnet BO object.',
    bacnetType: 4, bacnetTypeName: BT[4], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 243, name: 'CI HW Input', category: 'CCT — Hardware I/O',
    description: 'Counter/pulse input terminal. Counts dry-contact pulses for pulse metering (energy, flow, etc.). Maps to a BACnet Pulse Converter object.',
    bacnetType: 23, bacnetTypeName: BT[23], context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT BACnet Objects ───────────────────────────────────────────────────

  { classid: 163, name: 'JCI AI', category: 'CCT — BACnet Object',
    description: 'JCI-branded Analog Input BACnet object in the CCT/FEC object model.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 164, name: 'JCI AO', category: 'CCT — BACnet Object',
    description: 'JCI-branded Analog Output BACnet object.',
    bacnetType: 1, bacnetTypeName: BT[1], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 165, name: 'JCI AV', category: 'CCT — BACnet Object',
    description: 'JCI-branded Analog Value BACnet object. Used for setpoints, calculations, and network-accessible values.',
    bacnetType: 2, bacnetTypeName: BT[2], context: 'both', source: 'CCT Primitives.xml / SCT dbexport' },

  { classid: 166, name: 'JCI BI', category: 'CCT — BACnet Object',
    description: 'JCI-branded Binary Input BACnet object.',
    bacnetType: 3, bacnetTypeName: BT[3], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 167, name: 'JCI BO', category: 'CCT — BACnet Object',
    description: 'JCI-branded Binary Output BACnet object.',
    bacnetType: 4, bacnetTypeName: BT[4], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 168, name: 'JCI BV', category: 'CCT — BACnet Object',
    description: 'JCI-branded Binary Value BACnet object.',
    bacnetType: 5, bacnetTypeName: BT[5], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 141, name: 'JCI MV', category: 'CCT — BACnet Object',
    description: 'JCI-branded Multi-State Value BACnet object.',
    bacnetType: 19, bacnetTypeName: BT[19], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 155, name: 'Trend Log', category: 'CCT — BACnet Object',
    description: 'BACnet Trend Log object. Records time-stamped samples of a monitored property at a configured interval or on change of value. The single most common object type in a large Metasys site.',
    bacnetType: 20, bacnetTypeName: BT[20], context: 'both', source: 'CCT Primitives.xml / SCT dbexport',
    notes: 'Count: 16,180 in a single campus archive' },

  { classid: 263, name: 'JCI Schedule', category: 'CCT — BACnet Object',
    description: 'BACnet Schedule object (standard type 17). Defines weekly and exception schedules for time-based control of BACnet commandable objects.',
    bacnetType: 17, bacnetTypeName: BT[17], context: 'both', source: 'CCT Primitives.xml / SCT dbexport' },

  { classid: 313, name: 'JCI Notification Class', category: 'CCT — BACnet Object',
    description: 'BACnet Notification Class object. Defines alarm distribution — which recipients receive alarm notifications and at what priority.',
    bacnetType: 15, bacnetTypeName: BT[15], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 161, name: 'JCI Calendar', category: 'CCT — BACnet Object',
    description: 'BACnet Calendar object. Defines special dates and date ranges used by Schedule objects for exception scheduling (holidays, shutdowns).',
    bacnetType: 6, bacnetTypeName: BT[6], context: 'cct', source: 'CCT Primitives.xml' },

  // ─── CCT Misc ────────────────────────────────────────────────────────────

  { classid: 128, name: 'Standard', category: 'CCT — System',
    description: 'Standard JCI object base type.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 194, name: 'FEC', category: 'CCT — System',
    description: 'Field Equipment Controller — the base class for all JCI FEC-type controllers (MS-FEC, M4-CCM, etc.).',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 862, name: 'IP_FEC', category: 'CCT — System',
    description: 'IP-enabled Field Equipment Controller. Root device object for BACnet/IP field controllers (M4-CGE, M4-CCM, etc.). Contains all sub-objects of the controller program.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 218, name: 'Event Log', category: 'CCT — System',
    description: 'BACnet Event Log object. Records alarm and event transitions with timestamps.',
    bacnetType: 25, bacnetTypeName: 'Event Log', context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 307, name: 'MSTP Master', category: 'CCT — System',
    description: 'BACnet MS/TP Master port object (Network Port class 307). Represents the RS-485 MS/TP bus port on a controller. Contains MAC address, baud rate, and network number configuration.',
    bacnetType: null, bacnetTypeName: null, context: 'both', source: 'CCT Primitives.xml' },

  { classid: 292, name: 'IP Network Port', category: 'CCT — System',
    description: 'BACnet/IP network port object on an IP-connected controller. Contains IP address, subnet mask, and BACnet/IP configuration.',
    bacnetType: 56, bacnetTypeName: BT[56], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 585, name: 'Standards Table', category: 'CCT — System',
    description: 'Reference table of standard JCI values used internally by the controller program.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 598, name: 'RIOM Dev', category: 'CCT — System',
    description: 'Remote I/O Module device object on the SA bus. Represents an expansion I/O module connected to the controller\'s sensor/actuator bus.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 640, name: 'RDDEV (Local Display)', category: 'CCT — System',
    description: 'Local controller display device (e.g., FX-DIS1710). Connected via SA bus to provide a field-mounted display for setpoint adjustment and status viewing.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 627, name: 'Net Sensor Device', category: 'CCT — System',
    description: 'Networked sensor device (e.g., ZFR wireless sensor) communicating over ZigBee or SA bus.',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 628, name: 'Net Sensor AI', category: 'CCT — System',
    description: 'Analog input point from a networked sensor device.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 910, name: 'SA Bus Device', category: 'CCT — System',
    description: 'Sensor/Actuator bus device integration. Represents a device on the low-speed SA bus (room sensors, ZFR radios, local displays).',
    bacnetType: null, bacnetTypeName: null, context: 'cct', source: 'CCT Primitives.xml' },

  // ─── SA Bus Remote I/O ────────────────────────────────────────────────────

  { classid: 671, name: 'RAI', category: 'CCT — SA Bus I/O',
    description: 'Remote Analog Input — analog input on an SA bus expansion module.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 672, name: 'RAO', category: 'CCT — SA Bus I/O',
    description: 'Remote Analog Output — analog output on an SA bus expansion module.',
    bacnetType: 1, bacnetTypeName: BT[1], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 673, name: 'RBI', category: 'CCT — SA Bus I/O',
    description: 'Remote Binary Input — binary/digital input on an SA bus expansion module.',
    bacnetType: 3, bacnetTypeName: BT[3], context: 'cct', source: 'CCT Primitives.xml' },

  { classid: 674, name: 'RBO', category: 'CCT — SA Bus I/O',
    description: 'Remote Binary Output — binary/digital output on an SA bus expansion module.',
    bacnetType: 4, bacnetTypeName: BT[4], context: 'cct', source: 'CCT Primitives.xml' },

  // ─── Metasys Network Engines ─────────────────────────────────────────────

  { classid: 185, name: 'NAE', category: 'Metasys — Network Engine',
    description: 'Network Automation Engine (NAE). IP-based building automation controller that serves as a BACnet/IP router and integrates field-level MS/TP controllers, N2 bus devices, and other sub-networks. Runs Metasys applications and supports 200–1,000+ points depending on model.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 192, name: 'NAE', category: 'Metasys — Network Engine',
    description: 'Network Automation Engine variant. See classid 185.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 651, name: 'NCE / NAE', category: 'Metasys — Network Engine',
    description: 'Network Control Engine or Network Automation Engine variant. A mid-level building automation controller with BACnet/IP connectivity.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 877, name: 'SNE', category: 'Metasys — Network Engine',
    description: 'Smart Network Engine (SNE). Next-generation NAE with higher processing capacity, expanded point count, and integrated BACnet/IP routing. Replaces the NAE in current installations.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 871, name: 'SNE', category: 'Metasys — Network Engine',
    description: 'Smart Network Engine variant. See classid 877.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 872, name: 'SNE', category: 'Metasys — Network Engine',
    description: 'Smart Network Engine variant. See classid 877.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 448, name: 'SNC', category: 'Metasys — Network Engine',
    description: 'Smart Network Controller (SNC). Compact SNE variant for smaller applications with reduced point count and a wall-mount form factor.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 425, name: 'ADS', category: 'Metasys — Network Engine',
    description: 'Application and Data Server (ADS). The site-level Metasys server that manages multiple NAEs/SNEs, hosts the Metasys UI, stores trend data, and provides operator workstation access. The root of a Metasys site.',
    bacnetType: 8, bacnetTypeName: BT[8], context: 'sct', source: 'SCT dbexport' },

  { classid: 286, name: 'DBCC', category: 'Metasys — Network Engine',
    description: 'Device Base Control Center. The root container object within an ADS that holds all connected engines and site-level configuration.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 195, name: 'Field Controller', category: 'Metasys — Network Engine',
    description: 'Field Controller binding object within an NAE/SNE. Represents a connected MS/TP FEC under NAE/SNE supervision.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 197, name: 'Equipment Definition', category: 'Metasys — Network Engine',
    description: 'Equipment definition container within an NAE/SNE. Groups the BACnet points for a piece of equipment (AHU, chiller, etc.).',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  // ─── Metasys BACnet Point Wrappers ───────────────────────────────────────

  { classid: 599, name: 'Metasys AI', category: 'Metasys — BACnet Point',
    description: 'Analog Input point at the NAE/SNE level. Wraps a BACnet AI object. Represents a sensor value exposed through the Metasys object model with engineering units and alarm limits.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'sct', source: 'SCT dbexport' },

  { classid: 600, name: 'Metasys AO', category: 'Metasys — BACnet Point',
    description: 'Analog Output point at the NAE/SNE level. Wraps a BACnet AO object.',
    bacnetType: 1, bacnetTypeName: BT[1], context: 'sct', source: 'SCT dbexport' },

  { classid: 601, name: 'Metasys AV', category: 'Metasys — BACnet Point',
    description: 'Analog Value point at the NAE/SNE level. Wraps a BACnet AV object. The most common Metasys point type — used for setpoints, calculated values, and operator-adjustable parameters.',
    bacnetType: 2, bacnetTypeName: BT[2], context: 'sct', source: 'SCT dbexport',
    notes: 'Count: 12,788 in a single campus archive' },

  { classid: 602, name: 'Metasys BI', category: 'Metasys — BACnet Point',
    description: 'Binary Input point at the NAE/SNE level. Wraps a BACnet BI object. Used for status feedback (running/stopped, open/closed).',
    bacnetType: 3, bacnetTypeName: BT[3], context: 'sct', source: 'SCT dbexport' },

  { classid: 603, name: 'Metasys BO', category: 'Metasys — BACnet Point',
    description: 'Binary Output command point at the NAE/SNE level. Wraps a BACnet BO object.',
    bacnetType: 4, bacnetTypeName: BT[4], context: 'sct', source: 'SCT dbexport' },

  { classid: 604, name: 'Metasys BV', category: 'Metasys — BACnet Point',
    description: 'Binary Value point at the NAE/SNE level. Wraps a BACnet BV object. Used for enable/disable flags, mode indicators, and Boolean setpoints.',
    bacnetType: 5, bacnetTypeName: BT[5], context: 'sct', source: 'SCT dbexport' },

  { classid: 606, name: 'Metasys MSV', category: 'Metasys — BACnet Point',
    description: 'Multi-State Value point at the NAE/SNE level. Wraps a BACnet MSV object. Used for mode selection (Off/Heat/Cool/Auto) and other multi-state setpoints.',
    bacnetType: 19, bacnetTypeName: BT[19], context: 'sct', source: 'SCT dbexport' },

  { classid: 608, name: 'Metasys Accumulator', category: 'Metasys — BACnet Point',
    description: 'Energy/pulse accumulator at the NAE/SNE level. Wraps a BACnet Pulse Converter object. Used for sub-metering of electrical, gas, water, and steam consumption.',
    bacnetType: 23, bacnetTypeName: BT[23], context: 'sct', source: 'SCT dbexport' },

  // ─── FC Bus Points ────────────────────────────────────────────────────────

  { classid: 500, name: 'FC AI', category: 'Metasys — FC Bus Point',
    description: 'Analog Input on the Field Controller (FC) bus. Exposed through the NAE/SNE as a BACnet AI.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'sct', source: 'SCT dbexport' },

  { classid: 501, name: 'FC AO', category: 'Metasys — FC Bus Point',
    description: 'Analog Output on the FC bus.',
    bacnetType: 1, bacnetTypeName: BT[1], context: 'sct', source: 'SCT dbexport' },

  { classid: 502, name: 'FC AV', category: 'Metasys — FC Bus Point',
    description: 'Analog Value on the FC bus. Used for setpoints and calculated values passed to/from FC bus controllers.',
    bacnetType: 2, bacnetTypeName: BT[2], context: 'sct', source: 'SCT dbexport' },

  { classid: 503, name: 'FC BI', category: 'Metasys — FC Bus Point',
    description: 'Binary Input on the FC bus.',
    bacnetType: 3, bacnetTypeName: BT[3], context: 'sct', source: 'SCT dbexport' },

  { classid: 504, name: 'FC BO', category: 'Metasys — FC Bus Point',
    description: 'Binary Output on the FC bus.',
    bacnetType: 4, bacnetTypeName: BT[4], context: 'sct', source: 'SCT dbexport' },

  { classid: 505, name: 'FC BV', category: 'Metasys — FC Bus Point',
    description: 'Binary Value on the FC bus.',
    bacnetType: 5, bacnetTypeName: BT[5], context: 'sct', source: 'SCT dbexport' },

  { classid: 519, name: 'FC MSV', category: 'Metasys — FC Bus Point',
    description: 'Multi-State Value on the FC bus.',
    bacnetType: 19, bacnetTypeName: BT[19], context: 'sct', source: 'SCT dbexport' },

  // ─── N2 Bus Points ────────────────────────────────────────────────────────

  { classid: 278, name: 'N2 Device', category: 'Metasys — N2 Bus',
    description: 'N2 bus device (controller). N2 is JCI\'s legacy RS-485 proprietary protocol used by DX-9100, TEC, and older field controllers. Integrated through an NAE N2 trunk.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 290, name: 'N2 Trunk', category: 'Metasys — N2 Bus',
    description: 'N2 bus trunk. The RS-485 physical bus segment that N2 devices communicate over. One NAE can support multiple N2 trunks.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 147, name: 'N2 AI', category: 'Metasys — N2 Bus',
    description: 'Analog Input from an N2 bus device. The N2 device\'s measured value exposed as a BACnet AI through the NAE.',
    bacnetType: 0, bacnetTypeName: BT[0], context: 'sct', source: 'SCT dbexport' },

  { classid: 148, name: 'N2 BI', category: 'Metasys — N2 Bus',
    description: 'Binary Input from an N2 bus device.',
    bacnetType: 3, bacnetTypeName: BT[3], context: 'sct', source: 'SCT dbexport' },

  { classid: 149, name: 'N2 AO', category: 'Metasys — N2 Bus',
    description: 'Analog Output to an N2 bus device. Commands sent from the NAE to an N2 device.',
    bacnetType: 1, bacnetTypeName: BT[1], context: 'sct', source: 'SCT dbexport' },

  { classid: 150, name: 'N2 BO', category: 'Metasys — N2 Bus',
    description: 'Binary Output to an N2 bus device.',
    bacnetType: 4, bacnetTypeName: BT[4], context: 'sct', source: 'SCT dbexport' },

  { classid: 151, name: 'N2 MSI', category: 'Metasys — N2 Bus',
    description: 'Multi-State Input from an N2 bus device (e.g., chiller fault codes, mode status).',
    bacnetType: 13, bacnetTypeName: BT[13], context: 'sct', source: 'SCT dbexport' },

  // ─── Schedule / Calendar ─────────────────────────────────────────────────

  { classid: 143, name: 'JCI Schedule', category: 'Metasys — Schedule',
    description: 'JCI proprietary Schedule object. Defines time-based control commands using JCI\'s internal scheduling engine. The most common non-point object type in a Metasys site.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport',
    notes: 'Count: 13,884 in a single campus archive' },

  { classid: 146, name: 'JCI Calendar', category: 'Metasys — Schedule',
    description: 'JCI Calendar object defining special dates and date ranges used by Schedule exception entries.',
    bacnetType: 6, bacnetTypeName: BT[6], context: 'sct', source: 'SCT dbexport' },

  { classid: 249, name: 'Solar Clock', category: 'Metasys — Schedule',
    description: 'Solar-based schedule object that calculates local sunrise/sunset times for a configured latitude/longitude. Used for lighting and shading control.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 336, name: 'JCI Calendar', category: 'Metasys — Schedule',
    description: 'JCI Calendar object variant (BACnet Calendar type 16).',
    bacnetType: 16, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 337, name: 'Schedule Exception Entry', category: 'Metasys — Schedule',
    description: 'A single exception date/range entry within a JCI Schedule. Defines an override period (holiday, special event) with its own time-value pairs.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 338, name: 'Schedule Exception Entry', category: 'Metasys — Schedule',
    description: 'Schedule exception entry variant.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 342, name: 'Schedule Exception', category: 'Metasys — Schedule',
    description: 'Schedule exception block — groups one or more exception entries for a specific period.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 326, name: 'Schedule Entry', category: 'Metasys — Schedule',
    description: 'A single time-value entry within a weekly JCI Schedule (e.g., Monday 06:00 → Occupied).',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 327, name: 'Schedule Entry', category: 'Metasys — Schedule',
    description: 'Schedule entry variant.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 328, name: 'Schedule Entry', category: 'Metasys — Schedule',
    description: 'Schedule entry variant.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  // ─── Algorithm / Programming Objects ─────────────────────────────────────

  { classid: 174, name: 'Algorithm', category: 'Metasys — Algorithm',
    description: 'Metasys programming algorithm object. Used for custom control logic in NAE/SNE programming (e.g., optimal start, reset schedules, energy calculations).',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 177, name: 'Algorithm', category: 'Metasys — Algorithm',
    description: 'Metasys algorithm variant — runtime accumulation or statistical calculations.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 178, name: 'Algorithm', category: 'Metasys — Algorithm',
    description: 'Metasys algorithm variant — statistical operations (min/max/average across multiple zones).',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 186, name: 'Algorithm', category: 'Metasys — Algorithm',
    description: 'Metasys algorithm variant — custom shutdown or interlock logic.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 275, name: 'Totalization', category: 'Metasys — Algorithm',
    description: 'Totalization/accumulation object within a programming sequence. Accumulates a running total (energy, runtime) over a configurable interval.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  // ─── Graphics ─────────────────────────────────────────────────────────────

  { classid: 344, name: 'Graphic Panel', category: 'Metasys — Graphics',
    description: 'Metasys graphic object — a single XAML-based graphic panel (e.g., AHU overview, chiller plant).',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 357, name: 'Graphic Binding', category: 'Metasys — Graphics',
    description: 'Binding object within a graphic that links a dynamic element (text, color, value display) to a BACnet point.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport',
    notes: 'Count: 1,870 in a single campus archive' },

  { classid: 717, name: 'Graphic', category: 'Metasys — Graphics',
    description: 'Generic Metasys graphic object.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 844, name: 'Facility Graphic', category: 'Metasys — Graphics',
    description: 'Facility-level graphic (floor plan, campus map). Stored in $FacilityGraphics in the ADS archive.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 807, name: 'Summary Definition', category: 'Metasys — Graphics',
    description: 'Summary definition — a pre-configured view of multiple points displayed as a tabular summary in the Metasys UI.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  // ─── Communication / System ───────────────────────────────────────────────

  { classid: 173, name: 'BBMD', category: 'Metasys — Communication',
    description: 'BACnet Broadcast Management Device object. Manages BACnet broadcast messages across IP subnets, enabling BACnet/IP devices on different subnets to communicate.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 135, name: 'Subscription Server', category: 'Metasys — Communication',
    description: 'Metasys subscription server object. Manages change-of-value subscriptions between Metasys servers and clients.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 661, name: 'Subscription Client', category: 'Metasys — Communication',
    description: 'Metasys subscription client. Subscribes to point changes from a remote server.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 129, name: 'BACnet Protocol Engine', category: 'Metasys — Communication',
    description: 'BACnet protocol engine object on an NAE/SNE. Manages the BACnet stack configuration including APDU timeout, retry count, and device instance.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 172, name: 'Alarm', category: 'Metasys — Communication',
    description: 'Metasys alarm object. Monitors a condition and generates an alarm notification when triggered.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 156, name: 'Event Log', category: 'Metasys — Communication',
    description: 'Metasys event log — records alarm history, operator actions, and system events on the ADS.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 176, name: 'User Tree / Folder', category: 'Metasys — Navigation',
    description: 'User-defined tree folder in the Metasys navigation hierarchy. Organizes points and objects into logical groups for the operator interface.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 348, name: 'User Tree Container', category: 'Metasys — Navigation',
    description: 'Top-level container for user-defined tree folders.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 908, name: 'Network Port', category: 'Metasys — Communication',
    description: 'BACnet Network Port object (type 56) on an NAE/SNE. Configures network interface parameters including IP address, subnet, and BACnet network number.',
    bacnetType: 56, bacnetTypeName: BT[56], context: 'sct', source: 'SCT dbexport' },

  { classid: 907, name: 'Firmware Update', category: 'Metasys — System',
    description: 'Firmware update management object on an engine. Used for OTA firmware upgrades from the ADS.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 196, name: 'SA Bus', category: 'Metasys — System',
    description: 'SA Bus (Sensor/Actuator Bus) port object on a controller. Manages the low-speed proprietary bus connecting room sensors, actuators, and local displays.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  // ─── SCT System Objects ───────────────────────────────────────────────────

  { classid: 2000, name: 'Site', category: 'SCT — System',
    description: 'Root site object in a Metasys SCT archive. Represents the entire site / campus.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 2004, name: 'SCT Configuration', category: 'SCT — System',
    description: 'SCT system configuration data container — holds SCT-internal settings, templates, and definitions.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 2006, name: 'SCT Controller Templates', category: 'SCT — System',
    description: 'Container for field controller templates stored in SCT. Templates define the standard point configuration for a controller type.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 2008, name: 'SCT Controller Template', category: 'SCT — System',
    description: 'A single SCT controller template definition.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 2009, name: 'SCT Device', category: 'SCT — System',
    description: 'SCT internal device representation (e.g., the SCT server itself).',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 2011, name: 'SCT Summary Definitions', category: 'SCT — System',
    description: 'Container for SCT summary view definitions.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },

  { classid: 2013, name: 'SCT Parameter Sheets', category: 'SCT — System',
    description: 'Container for SCT controller parameter sheets — commissioning data for field controllers.',
    bacnetType: null, bacnetTypeName: null, context: 'sct', source: 'SCT dbexport' },
];

// Deduplicate on classid (keep first occurrence)
const seen = new Set<number>();
export const DICTIONARY_UNIQUE = DICTIONARY.filter(e => {
  if (seen.has(e.classid)) return false;
  seen.add(e.classid);
  return true;
});

export const CATEGORIES = [...new Set(DICTIONARY_UNIQUE.map(e => e.category))].sort();
export const CLASS_NAMES: Record<number, string> = Object.fromEntries(
  DICTIONARY_UNIQUE.map(entry => [entry.classid, entry.name]),
);
