import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  pingHttpService(): string {
    console.log('Simulating HTTP service unavailability...');
    throw new ServiceUnavailableException('HTTP service is intentionally unavailable (simulated 503).');
  }
}
