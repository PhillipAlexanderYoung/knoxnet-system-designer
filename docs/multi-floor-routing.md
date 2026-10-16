# Floors and multi-floor cable routes

The **Floors** view registers drawings in a shared building coordinate system and routes one cable through multiple floor plans. Existing projects and single-sheet tools work without floor configuration.

## Prepare and align drawings

1. Import PDFs in **Sheets** and calibrate each against a known building dimension. PDF page size is not a real-world building scale.
2. Open **Floors**, create named floors, and enter elevations relative to a common datum. All distances use **feet**, matching existing estimating. New floors start at zero; enter actual elevations before estimating.
3. Assign each drawing to a floor. Multiple drawings may belong to one floor. Set its routing height above that floor to describe the horizontal cable pathway.
4. Choose an aligned drawing as the overlay/reference. Adjust overlay opacity to compare plans.
5. Select **Align using two matching points**. Click two grid intersections or other fixed points on the reference drawing, then the same points in the same order on the active drawing. Translation and rotation change; calibration does not. A distance mismatch above 2% asks you to check calibration.

Manual X/Y offsets and rotation are available. Zoom/pan affect only the viewport. Geometry stays in original drawing coordinates.

## Route a cable

1. Place endpoint devices on their drawings in Sheets. Device tags must be unique across the project.
2. In Floors, name and place a riser where cables pass between floors. Risers share one vertical building X/Y position.
3. Select the starting drawing, enter a cable label/type, choose a start device, and click **Start cable**.
4. Click route bends. Choose a riser and a drawing on another floor, then **Continue through riser**. The current segment ends at the riser; the next starts at that building position on the destination drawing.
5. Continue across further floors as necessary. Choose an end device and **Finish at device**. Enter the total service-loop/drop allowance before saving.

Saving creates one project-level route, one logical device connection, and a locked segment on each visited drawing. Segment labels such as `MF-001/1` and `MF-001/2` identify the shared cable; endpoint text identifies adjacent drawings. Segments use the existing sheet/PDF renderers, and the signal-flow diagram uses the endpoint connection.

## Measurement

The shared bid/report measurement path totals:

`sum(horizontal lengths) + sum(abs(destination pathway elevation - source pathway elevation))`

Pathway elevation is floor elevation plus drawing routing height. Service loops are added once to the combined route, then project slack applies once. Cable reports show one row per physical cable; bids include its full length once.

Example: two 10 ft horizontal segments at pathway elevations of 8 ft and 21 ft give 33 ft. A 2 ft allowance and 10% slack produce 38.5 ft.

Floor-height changes recalculate vertical distances. Alignment changes that separate a segment from its riser generate warnings. Missing segments, drawings, calibration, or risers do not produce partial estimates: the cable is excluded from bid totals with a warning, and its report row has blank lengths plus a warning. Review Floors and bid warnings before issuing estimates.

## Editing and limits

- Settings, alignment, route creation, and removal support undo/redo and `.knoxnet` round-trips.
- Remove and redraw saved routes to change paths. Segments and moves of attached devices are locked. Deleting a segment removes the complete route and connection; undo restores it.
- Remove routes before deleting their drawings.
- This version uses vertical risers and one routing height per drawing. It does not model sloped shafts, automatic obstacle avoidance, or device mounting heights. Include terminal drops in the allowance. Offset shafts can use horizontal segments between separate risers on an intermediate floor.
- This is a 2D aligned overlay, not a 3D building viewer. Original drawing files are unchanged.
- Use an application version with Floors support when sharing these projects. Older versions do not understand multi-floor measurement and may total only horizontal segments.
