# Runtime image for the NPMS Auth Service.
# The fat jar is built locally with `mvn -pl npms-auth-service package -DskipTests`
# (run from the backend/ directory) before building this image.
FROM eclipse-temurin:21-jre

WORKDIR /app

# Copy the pre-built Spring Boot executable jar
COPY target/npms-auth-service-*.jar app.jar

EXPOSE 8081

# JVM container-awareness + sensible defaults
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
