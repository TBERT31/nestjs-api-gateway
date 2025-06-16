import { HttpService } from '@nestjs/axios';
import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, map, repeat, retry, tap, throwError, timer } from 'rxjs';

@Injectable()
export class AppService {
  constructor(
    @Inject('SERVICE_A') private readonly clientServiceA: ClientProxy,
    @Inject('SERVICE_B') private readonly clientServiceB: ClientProxy,
    private readonly httpService: HttpService,
  ) {}

  pingServiceA() {
    const startTs = Date.now();
    const pattern = { cmd: 'ping' };
    const payload = {};
    return this.clientServiceA
      .send<string>(pattern, payload)
      .pipe(
        map((message: string) => ({ message, duration: Date.now() - startTs })),
      );
  }

  pingServiceB() {
    const startTs = Date.now();
    const pattern = { cmd: 'ping' };
    const payload = {};
    return this.clientServiceB
      .send<string>(pattern, payload)
      .pipe(
        map((message: string) => ({ message, duration: Date.now() - startTs })),
      );
  }

getMetrics() {
    const url = 'https://metrics'; // Assurez-vous que cette URL est correcte ou simule un échec

    return this.httpService.get(url)
      .pipe(
        // Tap pour loguer le succès
        tap(() => console.log('Requête HTTP réussie vers', url)),
        // catchError pour loguer l'erreur initiale avant le retry
        catchError((error, caught: any) => {
          console.error(`### Erreur HTTP détectée pour ${url}: ${error.message}. Statut: ${error.response?.status || 'N/A'}`);
          // Il est important de relancer l'erreur ici pour que `retry` puisse la capturer
          return throwError(() => error);
        }),
        // Utilisation d'un seul opérateur retry avec une configuration complète
        retry({
          count: 3, // Nombre maximum de tentatives de retry
          delay: (error, retryCount: number) => {
            // Log de chaque tentative de retry
            console.log(`--- Tentative de retry #${retryCount} pour l'erreur: ${error.message} ---`);

            // Calcul du délai exponentiel avec un plafond de 1 minute (60000 ms)
            // Correction: utiliser 2 ** retryCount pour l'exponentiation
            const delayMs = Math.min(60000, (2 ** retryCount) * 1000);
            console.log(`Délai avant la prochaine tentative: ${delayMs}ms`);

            // Retourne un Observable (ici, un timer) qui émet après le délai spécifié.
            // L'émission de cet Observable signale à l'opérateur retry de relancer la source.
            return timer(delayMs);
          },
          // L'opérateur `retry` avec une fonction `delay` ne nécessite pas
          // d'utiliser `retryWhen` ou `scan` séparément, car la logique
          // est contenue dans la fonction `delay` elle-même.
        })
      );
  }
}