import { timer, throwError, Observable } from 'rxjs';
import { catchError, map, retry, tap } from 'rxjs/operators';
import { AxiosError, AxiosResponse } from 'axios';
import { HttpException, HttpStatus } from '@nestjs/common';

interface BackendErrorData {
  message?: string;
}

export function httpRetryOperator<T>(requestIdentifier: string, maxRetries: number = 3) {
  return function (source: Observable<AxiosResponse<T>>): Observable<T> {
    return source.pipe(
      tap(() => console.log(`➡️ Attempting HTTP request to ${requestIdentifier} (initial attempt)...`)),
      
      map(response => response.data),

      retry({
        count: maxRetries, 
        delay: (error: AxiosError, retryCount: number) => {
          console.warn(`⚠️ Retry attempt ${retryCount}/${maxRetries} for ${requestIdentifier}. Error: ${error.message}`);
          
          if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== HttpStatus.TOO_MANY_REQUESTS) {
            console.error(`🛑 Not retrying for client error status ${error.response.status} for ${requestIdentifier}. Propagating error immediately.`);
            return throwError(() => error); 
          }

          const delayTime = Math.min(60000, (2 ** retryCount) * 1000); 
          console.log(`⏳ Waiting ${delayTime / 1000} seconds before next retry for ${requestIdentifier}...`);
          
          return timer(delayTime); 
        },
      }),

      catchError((error: AxiosError) => {
        console.error(`❌ Final error after all ${maxRetries} retries failed for ${requestIdentifier}: ${error.message}`);
        
        if (error.response) {
          const backendMessage = (error.response.data as BackendErrorData)?.message || 'Service backend indisponible après tentatives.';

          throw new HttpException(
            {
              message: backendMessage,
              error: error.response.statusText,
              statusCode: error.response.status,
            },
            error.response.status,
          );
        }

        throw new HttpException(
          `Impossible de joindre le service HTTP (${requestIdentifier}) après plusieurs tentatives (problème réseau ou service non démarré).`,
          HttpStatus.SERVICE_UNAVAILABLE, 
        );
      }),
    );
  };
}