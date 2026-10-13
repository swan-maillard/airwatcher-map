# AirWatcher sensor map

An interactive map of the sensor network from AirWatcher, a C++ project from my third year at INSA Lyon. Pick a sensor and you see the five neighbours the faulty-sensor scan compares it with, the four checks it runs and why it ends up flagged or not, with the real numbers. Pick one of the two air cleaners and you see how the app estimates the area it cleaned.

Live page: https://swan-maillard.github.io/airwatcher-map/

## The project

AirWatcher was a third-year project at INSA Lyon in 2023. We were four, writing a C++11 console app (Makefile, black-box shell tests, 11 of 11 passing) over a CSV data set of 100 sensors measuring O3, SO2, NO2 and PM10 once a day through 2019, plus 2 air cleaners. It had role-gated menus and area statistics.

Code: https://github.com/swan-maillard/INSA-3A-AirWatcher

## What this demo shows

- All 100 sensors and both air cleaners, placed from their latitude and longitude.
- For a sensor: its 5 nearest sensors, then for each pollutant its last reading, the reference and tolerance built from those neighbours, and whether it falls outside. With the default settings it flags the same 6 sensors as the compiled app: 1, 43, 53, 63, 68 and 73.
- For an air cleaner: the readings before and after it ran, the sensors the check walks through from nearest to furthest, and the radius it reports (127.426 km for cleaner 1, no effect for cleaner 0).
- A "try it yourself" box that goes further than the school version: change the number of neighbours, scale the tolerance, or run the scan on another day of 2019. The school version only used each sensor's last reading, and the page starts there.

The data in `public/data` is the project's CSV data, copied as is.

## Differences with the school version

- The scan and the air-cleaner check follow the C++ line by line, including the distance formula, the comparisons and the order of the sums. The login, roles and area statistics aren't part of the demo.
- JavaScript's `Math` and glibc can round `sin`, `cos`, `acos` or `pow` one bit apart, so 34 of the 9,900 distances and 1 of the 400 variances differ from the C++ in the 16th significant digit. The neighbour order and every verdict are the same.
- In the C++ app, the air-cleaner check skips sensors the scan flagged only if the scan ran earlier in the same session. Here it always skips them. On this data the result is the same either way, and a test checks both.
- With a different number of neighbours in "try it yourself", the mean divides by that number and the variance by one less, where the C++ has 5 and 4 written in.

## Tests

`npm test` checks the TypeScript against the C++ app:

- `test/fixtures/cpp-scan-dump.txt` comes from the C++ code compiled with g++ 11, with one `printf` added to a copy of `SensorAnalysis.cpp` just before the comparison. The tests compare every sensor's last readings, means, variances and full neighbour order with it, and check the 6 flagged sensors.
- The cleaner results match what the compiled app prints on the real data (cleaner 0: no effect, cleaner 1: 93, 93, 94 and 93% with a 127.426 km radius).
- The project's own test cases 7, 8, 10 and 11 run on their data and give the same results as their expected outputs.

## Run it

```sh
npm install
npm run dev
npm test
```
