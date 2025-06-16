import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getData() {
    // Randomly fail to demonstrate the circuit breaker
    if (Math.random() > 0.5) {
      throw new HttpException(
        'Service Failure',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { success: true, data: 'Here is your data!' };
  }
}