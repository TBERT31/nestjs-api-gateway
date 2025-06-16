import { HttpService } from '@nestjs/axios';
import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { AxiosError } from 'axios';
import { firstValueFrom, throwError, timer } from 'rxjs';
import { catchError, map, repeat, retry, tap } from 'rxjs/operators';

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

  // async pingHttpService() {
  //   const response = await firstValueFrom(
  //     this.httpService.get('http://localhost:7002/ping-http'),
  //   );
  //     return response.data;
  // }
  pingHttpService() {
    const maxRetries = 5; // Définir le nombre maximum de tentatives de retry APRES la première requête

    return this.httpService.get('http://localhost:7002/ping-http').pipe(
      // --- LOG POUR LA TENTATIVE INITIALE ---
      // 'tap' permet de faire des effets de bord (comme logguer) sans modifier le flux
      tap(() => console.log('➡️ Attempting HTTP request to /ping-http (initial attempt)...')),
      
      // Mappe la réponse pour n'extraire que les données en cas de succès
      map(response => response.data),

      // Configure l'opérateur 'retry' pour gérer les nouvelles tentatives en cas d'erreur
      retry({
        count: maxRetries, // Nombre de tentatives de retry après la première erreur
        delay: (error: AxiosError, retryCount: number) => {
          // --- LOG POUR CHAQUE TENTATIVE DE RETRY ---
          console.warn(`⚠️ Retry attempt ${retryCount}/${maxRetries} for HTTP request. Error: ${error.message}`);
          
          // Condition pour décider si on doit retry ou arrêter tout de suite
          // Ne pas retry sur les erreurs client (4xx), sauf 429 (Too Many Requests)
          if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
            console.error(`🛑 Not retrying for client error status ${error.response.status}. Propagating error immediately.`);
            // throwError arrête le flux et propage l'erreur sans retry supplémentaire
            return throwError(() => error); 
          }

          // Calcul du délai avec un backoff exponentiel (2s, 4s, 8s, etc.)
          // Math.min(60000, ...) plafonne le délai à 60 secondes (60000 ms)
          const delayTime = Math.min(60000, (2 ** retryCount) * 1000); 
          // --- LOG POUR LE DÉLAI D'ATTENTE ---
          console.log(`⏳ Waiting ${delayTime / 1000} seconds before next retry...`);
          
          // 'timer' retourne un Observable qui émet après le délai spécifié, déclenchant le retry
          return timer(delayTime); 
        },
      }),

      // 'catchError' est placé APRÈS 'retry' pour n'intercepter l'erreur
      // que si toutes les tentatives de retry ont échoué ou si 'retry' a décidé d'arrêter.
      catchError((error: AxiosError) => {
        // --- LOG POUR L'ERREUR FINALE APRÈS ÉCHEC DE TOUS LES RETRIES ---
        console.error(`❌ Final error after all ${maxRetries} retries failed or retry condition not met: ${error.message}`);
        
        if (error.response) {
          const backendMessage = error.response.data && typeof error.response.data === 'object' && 'message' in error.response.data
            ? error.response.data.message
            : 'Service backend indisponible après tentatives.';

          // Si l'erreur provient d'une réponse HTTP du service backend (ex: votre 503)
          throw new HttpException(
            {
              // Tente de récupérer le message d'erreur original du backend si disponible
              message: backendMessage,
              error: error.response.statusText,
              statusCode: error.response.status,
            },
            error.response.status, // Utilisez le statut HTTP du backend
          );
        }
        // Si c'est une erreur réseau (pas de réponse du serveur, timeout avant la réponse, etc.)
        throw new HttpException(
          'Impossible de joindre le service HTTP après plusieurs tentatives (problème réseau ou service non démarré).',
          HttpStatus.SERVICE_UNAVAILABLE, // Code d'erreur HTTP 503
        );
      }),
    );
  }
}