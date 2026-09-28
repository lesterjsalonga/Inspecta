export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function requireText(value, name, max = 12000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new AppError(name + ' is required and must contain at most ' + max + ' characters.');
  }
  return value.trim();
}
export function commitSha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value))
    throw new AppError('Use a full 40-character commit SHA.');
  return value.toLowerCase();
}
