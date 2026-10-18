package local.slope.securityprobe;

import android.app.Activity;
import android.os.Bundle;
import android.content.ComponentName;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;
import android.widget.TextView;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;

// No permissions, network access, raw data reads, or destructive actions.
public class ProbeActivity extends Activity {
  private static final String TARGET = "com.quedotcom.androidslope";
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    JSONObject result = new JSONObject();
    try {
      result.put("probeUid", android.os.Process.myUid());
      result.put("targetUid", getPackageManager().getApplicationInfo(TARGET, 0).uid);
      result.put("databaseReadable", new File("/data/user/0/" + TARGET + "/databases/RKStorage").canRead());
      JSONArray providers = new JSONArray();
      String[] authorities = {TARGET + ".FileSystemFileProvider", TARGET + ".mlkitinitprovider",
        TARGET + ".resources.AndroidContextProvider", TARGET + ".androidx-startup"};
      for (String authority : authorities) {
        JSONObject row = new JSONObject().put("authority", authority);
        try {
          Cursor cursor = getContentResolver().query(Uri.parse("content://" + authority + "/"), null, null, null, null);
          row.put("securityDenied", false).put("cursorReturned", cursor != null);
          if (cursor != null) cursor.close(); // Never read a returned row.
        } catch (SecurityException denied) {
          row.put("securityDenied", true);
        } catch (Exception other) {
          row.put("securityDenied", false).put("otherErrorType", other.getClass().getSimpleName());
        }
        providers.put(row);
      }
      result.put("providers", providers);
      JSONArray services = new JSONArray();
      for (String name : new String[]{"dev.hackathon.kit.kitnative.engine.MonitorService", "dev.hackathon.kit.kitnative.engine.WebGuardService"}) {
        JSONObject row = new JSONObject().put("component", name);
        try {
          ComponentName started = startService(new Intent().setComponent(new ComponentName(TARGET, name)));
          row.put("securityDenied", false).put("componentReturned", started != null);
        } catch (SecurityException denied) {
          row.put("securityDenied", true);
        } catch (Exception other) {
          row.put("securityDenied", false).put("otherErrorType", other.getClass().getSimpleName());
        }
        services.put(row);
      }
      result.put("services", services);
    } catch (Exception error) {
      try { result.put("probeErrorType", error.getClass().getSimpleName()); } catch (Exception ignored) {}
    }
    Log.i("SlopeProbe", result.toString());
    TextView text = new TextView(this);
    text.setText(result.toString());
    setContentView(text);
  }
}
