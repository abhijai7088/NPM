# Build stage
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /app

# Copy parent pom.xml and all required backend code
COPY . .

# Package the service
RUN mvn clean package -pl npms-core-service -am -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/npms-core-service/target/npms-core-service-*.jar app.jar
EXPOSE 8083
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
