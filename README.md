# ECG telemetry simulator with interactive pacemaker

[sevenlayercookie.github.io/pacemaker-sim](https://sevenlayercookie.github.io/pacemaker-sim)

# # Two parts

# # # ECG telemetry
1. Dynamically generated and customizable
2. Many different rhythms supported
3. Adjustable heart rate, PR interval, ectopy, etc.
4. Responds to pacemaker impulses
   
# # # Interactive pacemaker
1. Fully implemented with standard pacemaker functions
2. Senses ongoing telemetry
3. Paces ongoing telemetry appropriately (or inappropriately if settings are not set wrong)
4. Training functions:
   - scramble underlying thresholds, then user must reset
   - adjustable feedback levels (how much feedback should be given to user on how to fix pacemaker settings)
     1. no feedback
     2. low feedback (alert that something is not write)
     3. medium feedback (more of a hint)
     4. high feedback (with full explanations)
