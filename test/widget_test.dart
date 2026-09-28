import 'package:flutter_test/flutter_test.dart';
import 'package:postcard/main.dart';

void main() {
  testWidgets('PostCard smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const PostCardApp());
    expect(find.text('PostCard'), findsWidgets);
  });
}
