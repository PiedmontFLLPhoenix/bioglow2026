# motor_run_test.py
# Diagnostic for "motor.run() doesn't work"
# Paste into Pybricks Code (code.pybricks.com or the installed app), connect the hub, run.
#
# Expected result: Test 1 does nothing. Tests 2-4 all spin the motor.
# If Test 1 "fails" and the rest pass, run() is working correctly and the
# original program was just missing a wait.

from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor
from pybricks.parameters import Port, Direction
from pybricks.tools import wait
from pybricks import version

# ---- CHANGE THIS to the port your test motor is plugged into (A-F) ----
PORT = Port.A
SPEED = 500          # degrees per second
# ----------------------------------------------------------------------

hub = PrimeHub()
print("Pybricks version:", version)

# If the motor is not plugged into PORT, this line raises OSError.
# That error alone tells you the port is wrong, not that run() is broken.
motor = Motor(PORT, Direction.CLOCKWISE)
print("Motor found on port. Starting angle:", motor.angle())


def report(label):
    print(label, "| speed:", motor.speed(), "| angle:", motor.angle())


# --- Test 1: run() with nothing after it -------------------------------
# This is the failure everyone reports. On its own in a program, the
# script would end here and the motor would stop before it visibly moves.
print("\nTest 1: run() with no wait (expect: barely moves)")
motor.reset_angle(0)
motor.run(SPEED)
motor.stop()                 # simulates the program ending immediately
wait(500)
report("Test 1 result")


# --- Test 2: run() + wait() --------------------------------------------
print("\nTest 2: run() + wait(2000) (expect: spins 2 seconds)")
motor.reset_angle(0)
motor.run(SPEED)
wait(2000)
report("Test 2 mid-run")      # speed should be near SPEED here
motor.stop()
wait(500)
report("Test 2 result")       # angle should be roughly SPEED * 2 degrees


# --- Test 3: run_time(), the blocking version --------------------------
print("\nTest 3: run_time(speed, 2000) (expect: spins 2 seconds)")
motor.reset_angle(0)
motor.run_time(SPEED, 2000)
report("Test 3 result")


# --- Test 4: run() inside a loop ---------------------------------------
# Proves run() holds speed while the program stays alive.
print("\nTest 4: run() inside a loop (expect: spins, prints 5 readings)")
motor.reset_angle(0)
motor.run(SPEED)
for i in range(5):
    wait(400)
    report("  sample " + str(i + 1))
motor.stop()


# --- Test 5: direction sanity check ------------------------------------
print("\nTest 5: reverse (expect: angle goes negative)")
motor.reset_angle(0)
motor.run(-SPEED)
wait(1000)
motor.stop()
report("Test 5 result")

print("\nDone. If tests 2-5 moved the motor, run() is fine.")
