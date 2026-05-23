import type { Point } from './geometry';

/**
 * Solves a system of linear equations M * x = b using Gaussian elimination with partial pivoting.
 * @param M - N x N matrix as array of rows
 * @param b - N-dimensional vector
 * @throws Error if the matrix is singular or degenerate
 */
export function solveLinearSystem(M: number[][], b: number[]): number[] {
  const n = b.length;
  // Create augmented matrix [M | b]
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push([...M[i], b[i]]);
  }

  for (let i = 0; i < n; i++) {
    // Find pivot row
    let maxRow = i;
    let maxVal = Math.abs(A[i][i]);
    for (let r = i + 1; r < n; r++) {
      const val = Math.abs(A[r][i]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = r;
      }
    }

    // Check if singular
    if (maxVal < 1e-12) {
      throw new Error('Matrix is singular or degenerate (points might be collinear)');
    }

    // Swap pivot row
    if (maxRow !== i) {
      const temp = A[i];
      A[i] = A[maxRow];
      A[maxRow] = temp;
    }

    // Eliminate below
    for (let r = i + 1; r < n; r++) {
      const factor = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) {
        A[r][c] -= factor * A[i][c];
      }
    }
  }

  // Back substitution
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = A[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * x[j];
    }
    x[i] = sum / A[i][i];
  }

  return x;
}

/**
 * Computes the 3x3 homography matrix H mapping 4 source points to 4 destination points.
 * The 9th element H[8] (h22) is normalized to 1.
 *
 * @param src - Array of 4 source Points (usually pixels [u, v])
 * @param dst - Array of 4 destination Points (usually real-world coordinates [x, y])
 * @returns 9-element array representing the 3x3 row-major homography matrix
 * @throws Error if src/dst do not have exactly 4 points or if the system cannot be solved
 */
export function computeHomography(src: Point[], dst: Point[]): number[] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('Homography requires exactly 4 point correspondences');
  }

  // Construct 8x8 matrix M and 8-dimensional vector b
  const M: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i];
    const { x, y } = dst[i];

    // Equation for x coordinate: h0*u + h1*v + h2 - h6*u*x - h7*v*x = x
    M.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);

    // Equation for y coordinate: h3*u + h4*v + h5 - h6*u*y - h7*v*y = y
    M.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const h8 = solveLinearSystem(M, b);
  return [...h8, 1]; // Return 3x3 matrix in flat form: [h00, h01, h02, h10, h11, h12, h20, h21, 1]
}

/**
 * Projects a 2D point using a 3x3 homography matrix.
 *
 * @param p - The point to project
 * @param h - The 9-element homography matrix
 * @returns The projected Point
 */
export function projectPoint(p: Point, h: number[]): Point {
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = h;

  // Compute homogeneous coordinates
  const w = h6 * p.x + h7 * p.y + h8;
  if (Math.abs(w) < 1e-12) {
    throw new Error('Projected coordinate division by zero (point at infinity)');
  }

  return {
    x: (h0 * p.x + h1 * p.y + h2) / w,
    y: (h3 * p.x + h4 * p.y + h5) / w,
  };
}

/**
 * Calculates the real-world distance on the reference plane between two pixel coordinates.
 *
 * @param p1 - Start point in pixels
 * @param p2 - End point in pixels
 * @param h - Homography matrix mapping pixels to real-world coordinates
 * @returns Real-world distance
 */
export function projectDistance(p1: Point, p2: Point, h: number[]): number {
  const r1 = projectPoint(p1, h);
  const r2 = projectPoint(p2, h);
  return Math.hypot(r2.x - r1.x, r2.y - r1.y);
}
