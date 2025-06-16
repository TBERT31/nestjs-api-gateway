import { pipe, timer, throwError, Observable } from 'rxjs';
import { catchError, map, retry, tap } from 'rxjs/operators';
import { AxiosError, AxiosResponse } from 'axios';
import { HttpException, HttpStatus } from '@nestjs/common';

// Interface pour typer les réponses d'erreur du backend, si elles ont un champ 'message'
interface BackendErrorData {
  message?: string;
  // Ajoutez d'autres champs si votre backend renvoie des erreurs structurées
}

/**
 * Crée un opérateur RxJS qui gère les retries avec backoff exponentiel et la gestion des erreurs HTTP.
 *
 * @param requestIdentifier Une chaîne pour identifier la requête dans les logs (ex: URL de la requête).
 * @param maxRetries Le nombre maximum de tentatives de retry après la requête initiale.
 * @returns Une fonction d'opérateur RxJS à utiliser dans un .pipe().
 */
export function httpRetryOperator<T>(requestIdentifier: string, maxRetries: number = 3) {
  // Cette fonction d'opérateur prend un Observable (ici, la réponse d'Axios)
  // et retourne un Observable transformé.
  return function (source: Observable<AxiosResponse<T>>): Observable<T> {
    return source.pipe(
      // --- LOG POUR LA TENTATIVE INITIALE ---
      // Utilise tap pour logguer sans modifier le flux de données
      tap(() => console.log(`➡️ Attempting HTTP request to ${requestIdentifier} (initial attempt)...`)),
      
      // Mappe la réponse Axios pour extraire uniquement la propriété 'data' en cas de succès.
      // C'est crucial car 'httpService' renvoie un Observable de 'AxiosResponse',
      // mais votre service veut retourner juste les données.
      map(response => response.data),

      // Configure l'opérateur 'retry' pour gérer les nouvelles tentatives en cas d'erreur.
      retry({
        count: maxRetries, // Nombre de tentatives de retry (après la première erreur)
        delay: (error: AxiosError, retryCount: number) => {
          // --- LOG POUR CHAQUE TENTATIVE DE RETRY ---
          console.warn(`⚠️ Retry attempt ${retryCount}/${maxRetries} for ${requestIdentifier}. Error: ${error.message}`);
          
          // Condition pour décider si on doit retry ou arrêter immédiatement.
          // Ne pas retry sur les erreurs client (4xx), sauf 429 (Too Many Requests),
          // car ce sont généralement des erreurs de logique ou de données qui ne se résoudront pas avec un retry.
          if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== HttpStatus.TOO_MANY_REQUESTS) {
            console.error(`🛑 Not retrying for client error status ${error.response.status} for ${requestIdentifier}. Propagating error immediately.`);
            // throwError arrête le flux et propage l'erreur sans retry supplémentaire.
            return throwError(() => error); 
          }

          // Calcul du délai avec un backoff exponentiel: 2s, 4s, 8s, etc.
          // Le délai est plafonné à 60 secondes (60000 ms) pour éviter des attentes trop longues.
          const delayTime = Math.min(60000, (2 ** retryCount) * 1000); 
          // --- LOG POUR LE DÉLAI D'ATTENTE ---
          console.log(`⏳ Waiting ${delayTime / 1000} seconds before next retry for ${requestIdentifier}...`);
          
          // 'timer' retourne un Observable qui émet après le délai spécifié, déclenchant la prochaine tentative.
          return timer(delayTime); 
        },
      }),

      // 'catchError' est placé APRÈS 'retry' pour n'intercepter l'erreur UNIQUEMENT
      // si toutes les tentatives de retry ont échoué ou si 'retry' a décidé d'arrêter.
      catchError((error: AxiosError) => {
        // --- LOG POUR L'ERREUR FINALE APRÈS ÉCHEC DE TOUS LES RETRIES ---
        console.error(`❌ Final error after all ${maxRetries} retries failed for ${requestIdentifier}: ${error.message}`);
        
        if (error.response) {
          // Tente de récupérer le message d'erreur original du backend si disponible,
          // en tenant compte de la structure de error.response.data.
          const backendMessage = (error.response.data as BackendErrorData)?.message || 'Service backend indisponible après tentatives.';

          // Si l'erreur provient d'une réponse HTTP du service backend (ex: votre 503 simulée)
          throw new HttpException(
            {
              message: backendMessage,
              error: error.response.statusText,
              statusCode: error.response.status,
            },
            error.response.status, // Utilise le statut HTTP du backend
          );
        }
        // Si c'est une erreur réseau (pas de réponse du serveur, timeout avant la réponse, etc.)
        throw new HttpException(
          `Impossible de joindre le service HTTP (${requestIdentifier}) après plusieurs tentatives (problème réseau ou service non démarré).`,
          HttpStatus.SERVICE_UNAVAILABLE, // Code d'erreur HTTP 503 Service Unavailable
        );
      }),
    );
  };
}