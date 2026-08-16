import java.security.*;
import java.io.FileOutputStream;
import java.util.Base64;

public class KeyGen {
    public static void main(String[] args) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair kp = kpg.generateKeyPair();
        
        String priv = "-----BEGIN PRIVATE KEY-----\n" + 
            Base64.getMimeEncoder(64, new byte[]{'\n'}).encodeToString(kp.getPrivate().getEncoded()) +
            "\n-----END PRIVATE KEY-----\n";
            
        String pub = "-----BEGIN PUBLIC KEY-----\n" + 
            Base64.getMimeEncoder(64, new byte[]{'\n'}).encodeToString(kp.getPublic().getEncoded()) +
            "\n-----END PUBLIC KEY-----\n";
            
        try (FileOutputStream fos = new FileOutputStream("private.pem")) {
            fos.write(priv.getBytes());
        }
        try (FileOutputStream fos = new FileOutputStream("public.pem")) {
            fos.write(pub.getBytes());
        }
    }
}
