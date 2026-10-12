# test_script.py - checks that the robot is wired correctly, and shows off what it can do.
#
# This program has three parts:
#   PART 1  THE TOOLBOX  - tricks you can copy into your own mission programs.
#   PART 2  THE TESTS    - checks every motor and sensor, using the toolbox.
#   PART 3  THE SHOW     - line following, a mission chooser and a victory dance.
#
# How to use it:
#   1. Put the robot on the mat with lots of free space around it.
#      Have a black line on the mat and all the attachments ready.
#   2. Run this program in Pybricks and watch the output window at the bottom.
#   3. Answer the questions with the hub buttons:
#        RIGHT button = yes / continue      LEFT button = no
#   After the tests the hub light is GREEN if everything is right, RED if not.
#   4. At the end, copy the TEST SUMMARY from the output window into the team
#      log on the dashboard ("What happened"), so the season has a record of it.
#
# The motor wiring below is copied from Tangled_and_Reasearch_Platform.py.
# The colour sensors are on D (line sensor, looking down) and A (mission sensor).
# If the robot changes, change it here AND in the mission programs.

from pybricks import version
from pybricks.hubs import PrimeHub
from pybricks.parameters import Button, Color, Direction, Icon, Port
from pybricks.pupdevices import ColorSensor, Motor
from pybricks.robotics import DriveBase
from pybricks.tools import StopWatch, wait

WHEEL_DIAMETER = 62.4   # mm
AXLE_TRACK = 90         # mm

RIGHT_DRIVE = ("right drive", Port.F, Direction.CLOCKWISE)
LEFT_DRIVE = ("left drive", Port.B, Direction.COUNTERCLOCKWISE)
RIGHT_ATTACHMENT = ("right attachment", Port.E, Direction.CLOCKWISE)
LEFT_ATTACHMENT = ("left attachment", Port.C, Direction.COUNTERCLOCKWISE)
MOTORS = [RIGHT_DRIVE, LEFT_DRIVE, RIGHT_ATTACHMENT, LEFT_ATTACHMENT]

LINE_SENSOR = ("line sensor", Port.D)         # looks down at the mat, for following lines
MISSION_SENSOR = ("mission sensor", Port.A)   # reads the colour piece built into each attachment
SENSORS = [LINE_SENSOR, MISSION_SENSOR]

# Colours the mission sensor can tell apart, with names for printing.
COLOR_NAMES = [(Color.RED, "red"), (Color.YELLOW, "yellow"), (Color.GREEN, "green"),
               (Color.BLUE, "blue"), (Color.WHITE, "white"), (Color.NONE, "nothing")]

hub = PrimeHub()


# =============================================================================
# PART 1  THE TOOLBOX
# Each of these is a trick that real FLL programs use. Copy them into your
# missions (or into Team_Phoenix_Library.py) and use them there.
# =============================================================================

def move_attachment(motor, speed, angle, max_time=1500):
    # TRICK: never get stuck.
    # motor.run_angle() waits until the motor gets there. If the attachment hits
    # a mission model and cannot get there, the whole program would wait forever.
    # So: start the move (wait=False), and give up after max_time milliseconds.
    # It returns how far the motor really moved, so you can check it worked.
    start = motor.angle()
    motor.run_angle(speed, angle, wait=False)
    timer = StopWatch()
    while not motor.done() and timer.time() < max_time:
        wait(10)
    motor.stop()
    return motor.angle() - start


def read_steady_color(sensor, times=20):
    # TRICK: do not trust one reading.
    # A sensor can see the wrong colour for a split second, for example at the
    # edge of a colour piece. Read it many times. Only if every reading agrees,
    # return the colour. Otherwise return None, meaning "not sure".
    first = sensor.color()
    for _ in range(times - 1):
        wait(20)
        if sensor.color() != first:
            return None
    return first


def follow_line(drive_base, sensor, distance, middle, speed=100, gain=1.2):
    # TRICK: steer by how far off you are. (Engineers call this a P-controller.)
    # The sensor rides on the LEFT edge of a black line: half on black, half on
    # white. Then it sees the "middle" value.
    #   Sees more white than middle -> drifted left  -> steer right.
    #   Sees more black than middle -> drifted right -> steer left.
    # The further off it is, the harder it steers. `gain` says how hard.
    #   Robot wobbles a lot?      Make gain smaller, like 0.8.
    #   Robot loses the line?     Make gain bigger, like 1.6.
    #   Following the RIGHT edge? Use a negative gain, like -1.2.
    drive_base.reset()
    while drive_base.distance() < distance:
        how_far_off = sensor.reflection() - middle
        drive_base.drive(speed, gain * how_far_off)
        wait(10)
    drive_base.stop()


def spin(drive_base, degrees, turn_rate=400):
    # TRICK: change speed for one move, then put it back.
    # settings() with nothing in it tells you the current settings, so you can
    # remember them and restore them afterwards.
    old = drive_base.settings()
    drive_base.settings(turn_rate=turn_rate)
    drive_base.turn(degrees)
    drive_base.settings(*old)


def victory_dance(drive_base):
    # Lights, music, spins and a figure eight. Needs about 60 x 60 cm free space.
    hub.display.icon(Icon.HAPPY)
    hub.light.animate([Color.RED, Color.ORANGE, Color.YELLOW, Color.GREEN, Color.BLUE, Color.VIOLET], 120)
    hub.speaker.play_notes(["C4/8", "E4/8", "G4/8", "C5/4", "G4/8", "C5/2"], tempo=140)

    spin(drive_base, 360)              # full spin one way...
    spin(drive_base, -360)             # ...and back

    for _ in range(3):                 # wiggle
        spin(drive_base, 25, 600)
        spin(drive_base, -25, 600)

    # drive(speed, turn rate) keeps going until you stop it. Going forward
    # while turning makes a circle: 150 mm/s at 120 degrees per second is one
    # full circle every 3 seconds. One circle left, one circle right = an eight.
    drive_base.drive(150, 120)
    wait(3000)
    drive_base.drive(150, -120)
    wait(3000)
    drive_base.stop()

    spin(drive_base, 720, 700)         # big finish: two fast spins
    hub.speaker.play_notes(["G4/8", "C5/2"], tempo=140)
    hub.light.on(Color.GREEN)


# --- the log
# Every line the test prints starts with the time since the start and a label,
# so the output window reads like a diary of the test:
#   [  12.3s] OK       Found the right drive motor on port F.
# Labels: TEST (a new test starts), OK, PROBLEM, FIX, MEASURE (a number we
# measured), DO (what the kids are asked to do), ASK and ANSWER, INFO.
# At the end, a summary collects every result and measurement in one place.

clock = StopWatch()
problems = []          # every problem found
measurements = []      # (what, value) - everything we measured
test_results = []      # (test name, "PASS" or "FAIL")
current_test = []      # [name, number of problems when it started]


def log(label, text):
    print("[{:6.1f}s] {:<8} {}".format(clock.time() / 1000, label, text))


def ok(text):
    log("OK", text)


def info(text):
    log("INFO", text)


def measure(what, value):
    measurements.append((what, value))
    log("MEASURE", "{}: {}".format(what, value))


def problem(text, fix):
    log("PROBLEM", text)
    log("FIX", fix)
    problems.append(text)


def finish_test():
    # A test passes if it found no new problems.
    if current_test:
        name, problems_before = current_test
        test_results.append((name, "PASS" if len(problems) == problems_before else "FAIL"))
        current_test.clear()


def start_test(name):
    finish_test()
    current_test.extend([name, len(problems)])
    print()
    log("TEST", "=== " + name + " ===")


def press():
    # Waits for LEFT or RIGHT, beeps, and returns the button.
    while True:
        pressed = hub.buttons.pressed()
        if Button.RIGHT in pressed or Button.LEFT in pressed:
            break
        wait(10)
    hub.speaker.beep()
    while hub.buttons.pressed():
        wait(10)
    return Button.RIGHT if Button.RIGHT in pressed else Button.LEFT


def ask(question):
    log("ASK", question)
    print("           RIGHT button = yes, LEFT button = no")
    yes = press() == Button.RIGHT
    log("ANSWER", "yes" if yes else "no")
    return yes


def continue_when_ready(instruction):
    log("DO", instruction)
    print("           Press the RIGHT button when you are ready.")
    while press() != Button.RIGHT:
        pass


def port_name(port):
    return str(port).replace("Port.", "port ")


def color_name(color):
    for c, name in COLOR_NAMES:
        if c == color:
            return name
    return "unknown"


# =============================================================================
# PART 2  THE TESTS
# =============================================================================

# ---------------------------------------------------------------- 1. battery
info("Phoenix robot test. Pybricks {}, hub name: {}".format(version[1], hub.system.name()))
start_test("1. Battery")
volts = hub.battery.voltage() / 1000
measure("battery", "{:.2f} V".format(volts))
if volts < 7.5:
    problem("The battery is low ({:.1f} V).".format(volts),
            "Charge the hub before testing. Low battery makes turns and distances wrong.")
else:
    ok("Battery is {:.1f} V.".format(volts))

# ------------------------------------------------------- 2. what is plugged in
# TRICK: Motor() and ColorSensor() give an error (OSError) when nothing is in
# that port. "try / except" catches the error so we can explain it instead.
start_test("2. Is every motor and sensor plugged into the right port?")
motors = {}
for name, port, direction in MOTORS:
    try:
        motors[name] = Motor(port, direction)
        ok("Found the {} motor on {}.".format(name, port_name(port)))
    except OSError:
        problem("No motor on {}.".format(port_name(port)),
                "Plug the {} motor into {}. Check that the cable is pushed all the way in.".format(
                    name, port_name(port)))

sensors = {}
for name, port in SENSORS:
    try:
        sensors[name] = ColorSensor(port)
        ok("Found the {} on {}.".format(name, port_name(port)))
    except OSError:
        problem("No colour sensor on {}.".format(port_name(port)),
                "Plug the {} into {}. Check that the cable is pushed all the way in.".format(
                    name, port_name(port)))

if len(motors) < len(MOTORS) or len(sensors) < len(SENSORS):
    print()
    print()
    print("==================================================")
    print("TEST SUMMARY - copy this into the team log")
    print("==================================================")
    print("Robot test stopped early: parts are not plugged in.")
    for p in problems:
        print("  -", p)
    print("Fix them first, then run this test again.")
    print("==================================================")
    hub.light.on(Color.RED)
    raise SystemExit

right_drive = motors[RIGHT_DRIVE[0]]
left_drive = motors[LEFT_DRIVE[0]]
right_attachment = motors[RIGHT_ATTACHMENT[0]]
left_attachment = motors[LEFT_ATTACHMENT[0]]
line_sensor = sensors[LINE_SENSOR[0]]
mission_sensor = sensors[MISSION_SENSOR[0]]

# ---------------------------------------- 3. push by hand: drive ports and directions
# TRICK: motors are also sensors. motor.angle() counts how far a motor has
# turned, even when you turn it by hand. No power used, so the robot cannot
# drive off the table. Pushed forward, both drive motors must count up.
start_test("3. Push test (drive motors)")
for m in motors.values():
    m.reset_angle(0)
continue_when_ready("Press RIGHT, then PUSH the robot FORWARD by hand about 20 cm (one hand length).")
continue_when_ready("Done pushing? Press RIGHT.")

right = right_drive.angle()
left = left_drive.angle()
measure("push test, right drive", "{} degrees".format(right))
measure("push test, left drive", "{} degrees".format(left))
if right > 90 and left > 90:
    ok("Both drive wheels turn forward when the robot goes forward.")
elif right < -90 and left < -90:
    problem("Both drive wheels count backwards.",
            "The left and right drive cables are probably swapped. Right drive goes in port F, left drive in port B.")
else:
    for name, angle, port in ((RIGHT_DRIVE[0], right, "F"), (LEFT_DRIVE[0], left, "B")):
        if angle < -90:
            problem("The {} motor counts backwards.".format(name),
                    "Check that the {} motor is in port {} and mounted the same way as on the robot photo.".format(name, port))
        elif abs(angle) <= 90:
            problem("The {} motor did not turn.".format(name),
                    "Is the {} wheel connected to its motor? Is the motor in port {}?".format(name, port))

for name in (RIGHT_ATTACHMENT[0], LEFT_ATTACHMENT[0]):
    if abs(motors[name].angle()) > 90:
        problem("The {} motor turned while you pushed the robot.".format(name),
                "That motor is probably plugged into a drive port. Check the cables.")

# ------------------------------------------------------------- 4. attachments
# Each attachment moves a little, one at a time. If the wrong one moves, the
# cables for C and E are swapped. Uses move_attachment() from the toolbox.
start_test("4. Attachment motors")
continue_when_ready("Make sure nothing is in the way of the attachments.")
for name, port, direction in (RIGHT_ATTACHMENT, LEFT_ATTACHMENT):
    m = motors[name]
    moved = move_attachment(m, 100, 45)
    measure(name + " moved", "{} of 45 degrees".format(moved))
    wait(300)
    move_attachment(m, 100, -moved)
    if moved < 30:
        problem("The {} motor got stuck (moved only {} of 45 degrees).".format(name, moved),
                "Something is jamming the {}. Check its gears and that nothing blocks it.".format(name))
    if not ask("Did the {} wiggle (and nothing else)?".format(name.upper())):
        problem("The {} did not wiggle when {} was moved.".format(name, port_name(port)),
                "Check that the {} motor is in {} and that its gears are connected.".format(
                    name, port_name(port)))
    else:
        ok("The {} works.".format(name))

# ------------------------------------------------------------- 5. driving
start_test("5. Driving")
drive_base = DriveBase(left_drive, right_drive, WHEEL_DIAMETER, AXLE_TRACK)
continue_when_ready("Put the robot down with 50 cm free in front. Put a ruler next to it.")
drive_base.straight(300)
measure("straight drive, wheels say", "{} mm".format(round(drive_base.distance())))
if ask("Did the robot drive FORWARD and STRAIGHT about 30 cm (one ruler)?"):
    ok("Driving straight works.")
else:
    problem("Driving 30 cm did not look right.",
            "If it went much too far or too short, the wheel size in the programs (62.4 mm) is wrong.")

# TRICK: two ways to measure the same thing. The wheels say how far the robot
# should have turned. The gyro inside the hub says how far it really turned.
# If they disagree, AXLE_TRACK (the distance between the wheels) is off.
continue_when_ready("Keep the robot still. It will now spin one full circle.")
while not hub.imu.ready():
    wait(10)
hub.imu.reset_heading(0)
drive_base.use_gyro(False)
drive_base.turn(360)
wait(500)
turned = hub.imu.heading()
measure("full circle, gyro says", "{} degrees (should be 360)".format(round(turned)))
if turned < 0:
    problem("The robot turned the wrong way.",
            "Check the drive motor ports and directions (see test 3).")
elif abs(turned - 360) > 15:
    problem("The turn was off by {} degrees.".format(round(turned - 360)),
            "Try AXLE_TRACK = {} in the programs instead of {}.".format(
                round(AXLE_TRACK * 360 / turned, 1), AXLE_TRACK))
else:
    ok("Turning works, and the gyro agrees.")

# TRICK: with use_gyro(True) the robot corrects itself with the gyro while it
# drives and turns. Missions should almost always have this on.
drive_base.use_gyro(True)

# -------------------------------------------------- 6. line sensor (port D)
# Drive slowly across a black line and remember the lightest and darkest the
# sensor saw. Line following needs a big difference between the two.
# TRICK: straight(..., wait=False) starts driving and lets the program keep
# going, so it can read the sensor WHILE the robot moves.
start_test("6. Line sensor")
continue_when_ready("Put the robot on the mat about 10 cm in front of a BLACK line, "
                    "pointing across it, with white mat on both sides.")
lightest, darkest = 0, 100
old_settings = drive_base.settings()
drive_base.settings(straight_speed=80)
drive_base.straight(250, wait=False)
while not drive_base.done():
    seen = line_sensor.reflection()
    lightest = max(lightest, seen)
    darkest = min(darkest, seen)
    wait(5)
drive_base.stop()
drive_base.settings(*old_settings)

line_middle = (lightest + darkest) // 2
line_ok = False
measure("line sensor, white mat", lightest)
measure("line sensor, black line", darkest)
measure("line sensor, middle value", line_middle)
if lightest < 40:
    problem("The line sensor never saw white (best was {}).".format(lightest),
            "The sensor is too high above the mat, or dirty. It should be about 1 cm from the mat.")
elif darkest > 30:
    problem("The line sensor never saw the black line (darkest was {}).".format(darkest),
            "Did the robot drive across the line? Is the line sensor in front of the wheels?")
elif lightest - darkest < 30:
    problem("White and black look too alike ({} vs {}).".format(lightest, darkest),
            "Move the sensor closer to the mat, about 1 cm.")
else:
    line_ok = True
    ok("The line sensor sees the line. Use {} as the line-following middle value.".format(line_middle))

# ------------------------------------------------ 7. mission sensor (port A)
# Every attachment must give one clear colour, and no two attachments may give
# the same colour. Uses read_steady_color() from the toolbox.
start_test("7. Mission sensor")
found = []
number = 1
while True:
    if not ask("Put attachment number {} on the robot. Ready? (LEFT = no more attachments)".format(number)):
        break
    color = read_steady_color(mission_sensor)
    measure("attachment {} colour".format(number),
            "{}  (hsv {})".format(color_name(color) if color is not None else "unsteady", mission_sensor.hsv()))
    if color is None:
        problem("Attachment {}: the colour keeps changing.".format(number),
                "Move the colour piece closer to the sensor, or use a bigger piece of one colour.")
    elif color == Color.NONE:
        problem("Attachment {}: the mission sensor sees no colour.".format(number),
                "Is the colour piece right in front of the sensor? It should be very close, about 1 cm.")
    elif color in [c for c, n in found]:
        other = [n for c, n in found if c == color][0]
        problem("Attachments {} and {} are both {}.".format(other, number, color_name(color)),
                "Give each attachment its own colour, or the robot will run the wrong mission.")
    else:
        ok("Attachment {} is {}.".format(number, color_name(color)))
        found.append((color, number))
    number += 1

# ------------------------------------------------------------------ result
# The summary: everything in one block, ready to copy into the team log.
finish_test()
passed = len([r for n, r in test_results if r == "PASS"])
hub.light.on(Color.RED if problems else Color.GREEN)
hub.display.icon(Icon.SAD if problems else Icon.HAPPY)

print()
print("==================================================")
print("TEST SUMMARY - copy this into the team log")
print("==================================================")
print("Robot test: {} of {} tests passed, took {} seconds.".format(
    passed, len(test_results), clock.time() // 1000))
print()
for name, result in test_results:
    print("  {}  {}".format(result, name))
print()
print("Measurements:")
for what, value in measurements:
    print("  {}: {}".format(what, value))
print()
if problems:
    print("Problems to fix:")
    for p in problems:
        print("  -", p)
else:
    print("No problems. Everything is wired correctly. Good to go!")
print("==================================================")


# =============================================================================
# PART 3  THE SHOW
# =============================================================================

# ------------------------------------------------------- show 1: line following
if line_ok and ask("SHOW: Do you want to see the robot follow a line?"):
    continue_when_ready("Put the robot ON a long black line, pointing along it, "
                        "with the line sensor on the LEFT edge of the line.")
    log("INFO", "Show: following the line for 40 cm, middle value {}".format(line_middle))
    timer = StopWatch()
    follow_line(drive_base, line_sensor, 400, line_middle)
    info("Followed the line for 40 cm in {:.1f} seconds.".format(timer.time() / 1000))


# --------------------------------------------------- show 2: the mission chooser
# This is how a real competition program can work: put on an attachment, the
# robot sees its colour and runs the matching mission. No menus, no mistakes.
# These missions are pretend. Replace them with real ones in your program.

def pretend_mission_red():
    info("Pretend mission RED: lifting the right attachment twice")
    for _ in range(2):
        move_attachment(right_attachment, 300, 90)
        move_attachment(right_attachment, 300, -90)


def pretend_mission_blue():
    info("Pretend mission BLUE: waving the left attachment")
    for _ in range(3):
        move_attachment(left_attachment, 400, 60)
        move_attachment(left_attachment, 400, -60)


def pretend_mission_green():
    info("Pretend mission GREEN: spin around and come back")
    spin(drive_base, 180)
    spin(drive_base, -180)


def pretend_mission_yellow():
    info("Pretend mission YELLOW: drive out 10 cm and back")
    drive_base.straight(100)
    drive_base.straight(-100)


# TRICK: a list that connects each colour to a mission. To add a mission, add
# one line here. The chooser below never needs to change.
MISSIONS = [
    (Color.RED, pretend_mission_red),
    (Color.BLUE, pretend_mission_blue),
    (Color.GREEN, pretend_mission_green),
    (Color.YELLOW, pretend_mission_yellow),
]

if ask("SHOW: Do you want to try the mission chooser?"):
    while True:
        if not ask("Put on an attachment, then press RIGHT to run its mission. (LEFT = stop)"):
            break
        color = read_steady_color(mission_sensor)
        mission = None
        for c, m in MISSIONS:
            if c == color:
                mission = m
        if mission is None:
            info("No mission for {}.".format(color_name(color) if color is not None else "an unsteady colour"))
            hub.speaker.beep(200, 300)      # low beep = no
            continue
        info("Saw {}: running its mission.".format(color_name(color)))
        hub.light.on(color)                 # the hub glows in the attachment's colour
        hub.speaker.beep(1000, 100)         # high beep = go
        mission()
    hub.light.on(Color.GREEN if not problems else Color.RED)


# -------------------------------------------------------- show 3: victory dance
if not problems and ask("SHOW: Everything works! Victory dance? (needs 60 x 60 cm free space)"):
    info("Victory dance!")
    victory_dance(drive_base)

print()
info("All done. Bye!")
