# Memory health

The monitor samples every 30 seconds. Heap pressure is `heapUsed / heapSizeLimit`,
where `heapSizeLimit` comes from V8. `heapTotal` remains available as allocated-heap
telemetry but does not determine health.

RSS pressure is `rss / rssBudget`. The budget is the smaller of physical host RAM
and a positive `process.constrainedMemory()` limit, when available. This is a
process-capacity check; it does not measure other processes' consumption or prove
that the operating system has sufficient free memory.

Each metric warns above 80% and becomes critical above 95%. The live monitor
requires three consecutive samples in the respective band (about 60 seconds from
the first high reading). Heap and RSS streaks are independent. A single critical
spike cannot promote a sustained warning. A sample below a threshold resets its
streak. Pending pressure appears in `notes`; missing limits are explicitly noted
and never inferred from allocated heap. Connection, CPU and event-loop failures
remain immediate.

The health REST response includes the optional `heapSizeLimit` and `rssBudget`
fields. Old snapshots without them remain readable. Critical health still returns
HTTP 503; degraded health returns 200. CLI doctor consumes the aggregate status.
The viewer uses these capacities for its gauges and the monitor's alerts for
colors. Memory alerts are named `memory_heap_warn_*`, `memory_heap_critical_*`,
`memory_rss_warn_*` and `memory_rss_critical_*` to identify the measured capacity.
