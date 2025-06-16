import { timer, throwError, Observable } from 'rxjs';
import { catchError, retry, tap } from 'rxjs/operators';
import { HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices'; 

export function tcpRetryOperator<T>(serviceIdentifier: string, maxRetries: number = 3) {
  return function (source: Observable<T>): Observable<T> {
    return source.pipe(
      tap(() => console.log(`➡️ Attempting TCP microservice call to ${serviceIdentifier} (initial attempt)...`)),
      
      retry({
        count: maxRetries, 
        delay: (error: any, retryCount: number) => { 
          console.warn(`⚠️ Retry attempt ${retryCount}/${maxRetries} for TCP microservice ${serviceIdentifier}. Error: ${error.message || error}`);
          
          if (error instanceof RpcException) {
            console.error(`🛑 Not retrying for RpcException from ${serviceIdentifier}. Propagating error immediately.`);
            return throwError(() => error); 
          }

          const delayTime = Math.min(60000, (2 ** retryCount) * 1000); 
          console.log(`⏳ Waiting ${delayTime / 1000} seconds before next retry for ${serviceIdentifier}...`);
          
          return timer(delayTime); 
        },
      }),

      catchError((error: any) => { 
        console.error(`❌ Final error after all ${maxRetries} retries failed for TCP microservice ${serviceIdentifier}: ${error.message || error}`);
        
        if (error instanceof RpcException) {
            throw new HttpException(
                {
                    message: error.message || `Microservice ${serviceIdentifier} returned an error after attempts.`,
                    error: 'Microservice Error',
                    statusCode: HttpStatus.BAD_GATEWAY, 
                },
                HttpStatus.BAD_GATEWAY,
            );
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new HttpException(
                `Microservice ${serviceIdentifier} is unreachable after several attempts (network or service problem).`,
                HttpStatus.SERVICE_UNAVAILABLE, 
            );
        } else {
            throw new HttpException(
                `An unknown error occurred with microservice ${serviceIdentifier} after attempts. Details: ${error.message || JSON.stringify(error)}`,
                HttpStatus.INTERNAL_SERVER_ERROR, 
            );
        }
      }),
    );
  };
}