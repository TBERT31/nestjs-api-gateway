import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { CircuitBreaker } from './circuit-breaker';
import { catchError } from 'rxjs/operators';

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private readonly circuitBreakerByHandler = new WeakMap<
    // eslint-disable-next-line @typescript-eslint/ban-types
    Function,
    CircuitBreaker
  >();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const methodRef = context.getHandler();

     const circuitBreaker = this.circuitBreakerByHandler.has(methodRef)
      ? this.circuitBreakerByHandler.get(methodRef)! 
      : (() => {
          const newCircuitBreaker = new CircuitBreaker({
            successThreshold: 3,
            failureThreshold: 3,
            openToHalfOpenWaitTime: 60000,
            fallback: () => {
              // Throwing an HttpException with 503 status code
              throw new HttpException(
                'Service unavailable. Please try again later.',
                HttpStatus.SERVICE_UNAVAILABLE,
              );
            },
          });
          this.circuitBreakerByHandler.set(methodRef, newCircuitBreaker);
          return newCircuitBreaker;
        })();

    return circuitBreaker.exec(next).pipe(
      catchError(() => {
        return throwError(
          () =>
            new HttpException(
              'Internal server error',
              HttpStatus.INTERNAL_SERVER_ERROR,
            ),
        );
      }),
    );
  }
}