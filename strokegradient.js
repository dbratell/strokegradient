"use strict";
/**
 * Code to create a gradient along a stroked path.
 * 
 * Can be minified with https://javascript-minifier.com
 *
 * Inspired by the shortcomings of https://bl.ocks.org/mbostock/4163057
 * @author Daniel Bratell
 */

/**
 * Main API function to create a nice gradient along a path.
 *
 * Usage:
 *    makePathGradient(originalPath, parentSelection, color, resolution, width, useStroke)
 * @param {*} originalPath The path that is the template for the gradient stroke. D3 selection.
 * @param {*} polygonLocation Place in the DOM tree to put the generated path segments. D3 selection
 * @param {*} color color function taking a number 0 to 1 and returning a color.
 * @param {*} resolution Length in pixels of path segments. This is in viewBox units.
 * @param {*} width Width of the polygons making up the path gradient. This is in viewBox units.
 * @param {*} useStroke If there should be a stroke around path segments to hide segment gaps.
 */
const makePathGradient = (function () {

/**
 * Main API function to create a nice gradient along a path.
 *
 * @param {*} originalPath The path that is the template for the gradient stroke.
 * @param {*} polygonLocation Place in the DOM tree to put the generated path segments.
 * @param {*} color color function taking a number 0 to 1 and returning a color.
 * @param {*} resolution Length in pixels of path segments. This is in viewBox units.
 * @param {*} width Width of the polygons making up the path gradient. This is in viewBox units.
 * @param {*} useStroke If there should be a stroke around path segments to hide segment gaps.
 */
 function makePathGradientImpl(originalPath, polygonLocation, color, resolution, width, useStroke, tempDisplay) {
    if (window.d3 === undefined) {
        throw "Requires d3.js to be loaded";
    }
    const path = d3.select(originalPath);
    const parentSelection = d3.select(polygonLocation);
    // Hide the original path since we are going to replace it with lots of small polygons.
    path.style("display", "none");

    const pathSamples = createPathSamples(originalPath, resolution);
    const epsilon = resolution / 1000;
    const isPathClosed = vectorLen(vectorDiff(pathSamples[0], pathSamples[pathSamples.length - 1])) < epsilon;
    const polygons = parentSelection.selectAll("path")
        .data(makePathSegmentDefinitions(pathSamples, isPathClosed))
        .join("path")
        .style("fill", tempDisplay ? "none" : function(d) { return color(d.t); })
        .attr("d", function(d) { return toLineSegmentPolygon(d[0], d[1], d[2], d[3], width); });
    if (useStroke) {
        // A very thin line to hide gaps between polygons. Thinnest possible line would be
        // 1 pixel, which you get with (1 / window.devicePixelRatio) +  "px" and

        polygons
            .style("stroke", useStroke ? function(d) { return color(d.t); } : "none")
            .style("stroke-width", (1 / window.devicePixelRatio) +  "px")
            .style("vector-effect", "non-scaling-stroke");
    }
}

/**
 * Creates groups of 4 points so that each path segments has its points
 * on position 1 and 2, and position 0 and 3 has preceding and successor points, if any.
 * Otherwise undefined. Each group has a t property (0-1) that is the average of the t of
 * the line points (p1 and p2).
 * @param points Sequence of points on a path.
 * @param isPathClosed Set to true if the start and end of the path should appear connected.
 * */
function makePathSegmentDefinitions(points, isPathClosed) {
    const numberOfPathSegments = points.length - 1;
    const beforePathPoint = isPathClosed ? points[points.length - 2] : undefined;
    const afterPathPoint = isPathClosed ? points[1] : undefined;
    const pathSegmentDefinitions = d3.range(numberOfPathSegments).map(function (i) {
        const pathSegmentDefinition = [
            i > 0 ? points[i - 1] : beforePathPoint,
            points[i],
            points[i + 1],
            i + 2 < points.length ? points[i + 2] : afterPathPoint];
        pathSegmentDefinition.t = (points[i].t + points[i + 1].t) / 2;
        return pathSegmentDefinition;
    });
    return pathSegmentDefinitions;
}


/**
 * Samples the SVG path uniformly with the specified precision.
 * @param path The path element to sample.
 * @param precision The resolution to sample with.
 * @returns An array of points [x, y] along the path. Each point has a t property saying
 * how far along the path it is, between 0 and 1.
 */
function createPathSamples(path, precision) {
    const pathLength = path.getTotalLength();
    const sampleLocations = [];
    const sampleCount = Math.floor(pathLength / precision) + 1;
    for (let i = 0; i < sampleCount; i++) {
        sampleLocations.push(i * pathLength / sampleCount);
    }
    // Do not miss the end point.
    if ((sampleCount - 1) * precision < pathLength) {
        sampleLocations.push(pathLength);
    }
    // This can be a performance bottleneck for high resolutions or high performance requirements.
    const result = sampleLocations.map(function (sampleLocation) {
        const p = path.getPointAtLength(sampleLocation);
        const a = [p.x, p.y];
        a.t = sampleLocation / pathLength;
        return a;
    });
    return result;
}

/**
 * @param r radius, as in padding on one side of the line p0-p1-p2.
 * @returns A vector of three (pointed lineJoin) or five (beveled lineJoin) points.
 */
function createLineJoinEdgePoints(p0, p1, p2, r) {
    const u01 = getOrthogonalUnitVector(p0, p1);
    const u12 = getOrthogonalUnitVector(p1, p2);

    // Note: "Left" might not be left but my nomenclature assumes the points go nicely from left to right.

    let p0Padded = [p0[0] + u01[0] * r, p0[1] + u01[1] * r];
    let p1PaddedLeft = [p1[0] + u01[0] * r, p1[1] + u01[1] * r];
    let p1PaddedRight = [p1[0] + u12[0] * r, p1[1] + u12[1] * r];
    let p2Padded = [p2[0] + u12[0] * r, p2[1] + u12[1] * r];
    // This adapts the "left" edge of the polygon to match the "right" edge of the previous polygon.
    if (p1PaddedRight[0] != p1PaddedLeft[0] || p1PaddedRight[1] != p1PaddedLeft[1]) {
        const intersectionPoint = getLineIntersectionPoint(p0Padded, p1PaddedLeft,
            p1PaddedRight, p2Padded);
        const miterVector = vectorDiff(p1, intersectionPoint);
        const miterLimit = 2 * r; // Double the "radius"
        let applyMiterLimit = false;
        const v01 = vectorDiff(p0, p1);
        const v12 = vectorDiff(p1, p2);
        // Todo: atan2 is slow, is there a faster way to determine if the line turns left or right?
        // Right now it can be between -2PI and 2PI. Normalize to -PI to PI.
        const angle012 = (Math.atan2(v12[0], v12[1]) - Math.atan2(v01[0], v01[1]) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

        if (angle012 < 0) {
            // This is the outer corner, where we want to apply a miter limit.
            const miterSize = vectorLen(miterVector);
            applyMiterLimit = miterSize > miterLimit;
        }
        if (applyMiterLimit) {
            // Bevel the edge by cutting off the miter.
            const u012 = toUnitVector(miterVector);
            const cuttingPoint = [p1[0] + u012[0] * miterLimit,
                                  p1[1] + u012[1] * miterLimit];
            const cuttingDirection = getOrthogonalUnitVector(p1, cuttingPoint); // or rotate u012 90 degrees
            const p1PaddedLeftMeetingPoint = getLineIntersectionPoint(p0Padded, p1PaddedLeft,
                                                       cuttingPoint,
                                                        [cuttingPoint[0] + cuttingDirection[0],
                                                         cuttingPoint[1] + cuttingDirection[1]]);
            const p1PaddedRightMeetingPoint = getLineIntersectionPoint(p2Padded, p1PaddedRight,
                                                            cuttingPoint,
                                                             [cuttingPoint[0] + cuttingDirection[0],
                                                              cuttingPoint[1] + cuttingDirection[1]]);
            return [p0Padded, p1PaddedLeftMeetingPoint, cuttingPoint, p1PaddedRightMeetingPoint, p2Padded];
        } else {
            return [p0Padded, intersectionPoint, p2Padded];
        }
    } else {
        // p1PaddedRight == p1PaddedLeft
        return [p0Padded, p1PaddedRight, p2Padded];
    }
}

// Compute stroke outline for segment p12.
function toLineSegmentPolygon(p0, p1, p2, p3, width) {
    const u12 = getOrthogonalUnitVector(p1, p2);
    const r = width / 2;

    const resultPoints = [];

    if (p0) {
        const upperLeft = createLineJoinEdgePoints(p0, p1, p2, r);
        if (upperLeft.length == 3) {
            resultPoints.push(upperLeft[1]);
        } else { // Beveled: 5 points
            resultPoints.push(upperLeft[2]);
            resultPoints.push(upperLeft[3]);
        }
    } else {
        const p1PaddedUpper = [p1[0] + u12[0] * r, p1[1] + u12[1] * r];
        resultPoints.push(p1PaddedUpper);
    }
    if (p3) {
        const upperRight = createLineJoinEdgePoints(p1, p2, p3, r);
        if (upperRight.length == 3) {
            resultPoints.push(upperRight[1]);
        } else { // Beveled: 5 points
            resultPoints.push(upperRight[1]);
            resultPoints.push(upperRight[2]);
        }
        const lowerRight = createLineJoinEdgePoints(p3, p2, p1, r);
        if (lowerRight.length == 3) {
            resultPoints.push(lowerRight[1]);
        } else { // Beveled: 5 points
            resultPoints.push(lowerRight[2]);
            resultPoints.push(lowerRight[3]);
        }
    } else {
        const p2PaddedUpper = [p2[0] + u12[0] * r, p2[1] + u12[1] * r];
        const p2PaddedLower = [p2[0] - u12[0] * r, p2[1] - u12[1] * r];
        resultPoints.push(p2PaddedUpper);
        resultPoints.push(p2PaddedLower);
    }

    if (p0) {
        const lowerLeft = createLineJoinEdgePoints(p2, p1, p0, r);
        if (lowerLeft.length == 3) {
            resultPoints.push(lowerLeft[1]);
        } else {
            // Beveled: 5 points - [p2, p21CutMiter, p1midPointCut, p10CutMiter, p0]
            resultPoints.push(lowerLeft[1]);
            resultPoints.push(lowerLeft[2]);
        }
    } else {
        const p1PaddedLower = [p1[0] - u12[0] * r, p1[1] - u12[1] * r];
        resultPoints.push(p1PaddedLower);
    }

    let resultSvgPathString = undefined;
    for (let point of resultPoints) {
        if (resultSvgPathString === undefined) {
            resultSvgPathString = "M"; // Move to
        } else {
            resultSvgPathString += "L"; // Line to
        }
        resultSvgPathString += point;
    }
    resultSvgPathString += "Z"; // Close path
    return resultSvgPathString;
}

/** Computes the length of vector v. */
function vectorLen(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

/** Returns a vector from a to b. */
function vectorDiff(a, b) {
    return [b[0] - a[0], b[1] - a[1]];
}

/** Treats |v| as a vector and adjusts the length to be a unit vector. Will crash if |v| is zero. */
function toUnitVector(v) {
    const len = vectorLen(v);
    return [v[0] / len, v[1] / len];
}


/** Compute the intersection point of two infinite lines passing through a-b and c-d respectively. Will crash if the lines are parallel. */
function getLineIntersectionPoint(a, b, c, d) {
  const cX = c[0];
  const aX = a[0];
  const cdDeltaX = d[0] - cX;
  const abDeltaX = b[0] - aX;
  const cY = c[1];
  const aY = a[1];
  const cdDeltaY = d[1] - cY;
  const abDeltaY = b[1] - aY;
  // Division by zero if the lines are parallel.
  const ua = (abDeltaX * (cY - aY) - abDeltaY * (cX - aX)) / (abDeltaY * cdDeltaX - abDeltaX * cdDeltaY);
  return [cX + ua * cdDeltaX, cY + ua * cdDeltaY];
}

/** Compute unit vector perpendicular to the line p0-p1. */
function getOrthogonalUnitVector(p0, p1) {
  const orthogonalVector = [p0[1] - p1[1], p1[0] - p0[0]];
  return toUnitVector(orthogonalVector);
}

return makePathGradientImpl;

} // end namespace function
 )();