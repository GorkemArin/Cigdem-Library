import type { NextFunction, Request, Response } from 'express';
import type { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function notFound(message = 'Sayfa bulunamadı.'): HttpError {
  return new HttpError(404, message);
}

export function validateId(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(404, 'Kayıt bulunamadı.');
  }
  return id;
}

export function formString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function formOptional(value: unknown): string | undefined {
  const text = formString(value);
  return text === '' ? undefined : text;
}

export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string') return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  return target;
}

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function renderError(
  res: Response,
  status: number,
  title: string,
  message: string,
): void {
  res.status(status).render('error', { title, status, message });
}

export function notFoundHandler(req: Request, res: Response): void {
  renderError(res, 404, 'Sayfa bulunamadı', 'Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.');
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof HttpError) {
    renderError(res, error.status, error.status === 404 ? 'Bulunamadı' : 'İşlem tamamlanamadı', error.message);
    return;
  }

  console.error(error);
  renderError(
    res,
    500,
    'Beklenmeyen bir hata oluştu',
    'İşlem sırasında bir sorun oluştu. Lütfen tekrar deneyin; sorun devam ederse kütüphane yöneticisine bildirin.',
  );
}
