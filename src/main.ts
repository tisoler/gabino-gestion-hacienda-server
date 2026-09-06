import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS
  const corsOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [
      "http://localhost:3053",
      "http://localhost:3056",
      "http://localhost:5173",
      "http://localhost:5174",
    ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix("api");

  // Validation pipe
  //
  // Configuración defensiva: tolera bodies parciales (PATCHs que sólo
  // envían los campos modificados) y propiedades extra (las strippea en
  // silencio), pero sigue aplicando whitelist para no guardar basura,
  // y coerce tipos (string -> number, etc.).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle("Gabino Gestión de Hacienda API")
    .setDescription("API para la gestión de hacienda Gabino")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT || 3055;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/docs`);
}
bootstrap();
